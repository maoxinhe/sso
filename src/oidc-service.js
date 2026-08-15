import { randomUrlSafe, sha256Base64Url, signJwt, timingSafeEqual, exportPublicJwk } from "./crypto.js";

export class OidcService {
  constructor({ store, config, now = () => new Date() }) {
    this.store = store;
    this.config = config;
    this.now = now;
  }

  getDiscoveryMetadata() {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: `${this.config.issuer}/authorize`,
      token_endpoint: `${this.config.issuer}/token`,
      userinfo_endpoint: `${this.config.issuer}/userinfo`,
      jwks_uri: `${this.config.issuer}/jwks.json`,
      grant_types_supported: ["authorization_code", "refresh_token"],
      response_types_supported: ["code", "id_token", "code id_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "email", "profile"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
      claims_supported: [
        "sub",
        "iss",
        "aud",
        "exp",
        "iat",
        "email",
        "email_verified",
        "name",
        "given_name",
        "family_name",
        "preferred_username",
      ],
    };
  }

  async getApp(clientId) {
    if (!clientId) return null;
    const app = await this.store.getAppByClientId(clientId);
    if (app) return app;
    // Legacy fallback: single-app mode via env vars
    if (this.config.legacyClientId && clientId === this.config.legacyClientId) {
      return {
        id: 0,
        clientId: this.config.legacyClientId,
        clientSecret: this.config.legacyClientSecret || "",
        name: "Default App",
        description: "",
        logoUrl: "",
        redirectUris: this.config.legacyRedirectUris,
        scopes: ["openid", "email", "profile"],
        isActive: true,
        isPublic: false,
        createdBy: null,
        createdAt: "",
        updatedAt: "",
      };
    }
    return null;
  }

  async validateAuthorizeRequest(params) {
    const clientId = params.get("client_id");
    const redirectUri = params.get("redirect_uri");
    const responseType = params.get("response_type");
    const scope = params.get("scope") ?? "";

    const app = await this.getApp(clientId);
    if (!app) throw new Error("未知的 OIDC 客户端");
    if (!app.isActive) throw new Error("OIDC 客户端已停用");
    // redirect_uri 校验已禁用，支持任意回调地址
    const allowedResponseTypes = ["code"];
    if (!allowedResponseTypes.includes(responseType)) {
      throw new Error("只支持 authorization code flow (response_type=code)");
    }
    const scopes = scope.split(/\s+/).filter(Boolean);
    if (!scopes.includes("openid")) {
      throw new Error("scope 必须包含 openid");
    }
    return {
      clientId,
      redirectUri,
      responseType,
      scope,
      state: params.get("state") ?? "",
      nonce: params.get("nonce") ?? "",
      codeChallenge: params.get("code_challenge") ?? "",
      codeChallengeMethod: params.get("code_challenge_method") ?? "",
      app,
    };
  }

  async createAuthorizationCode({ user, clientId, redirectUri, scope, nonce, codeChallenge, codeChallengeMethod }) {
    const now = this.now();
    const code = randomUrlSafe(32);
    const record = {
      code,
      userId: user.id,
      email: user.email,
      clientId,
      redirectUri,
      scope,
      nonce,
      codeChallenge,
      codeChallengeMethod,
      expiresAt: new Date(now.getTime() + this.config.authorizationCodeTtlSeconds * 1000).toISOString(),
      usedAt: null,
      createdAt: now.toISOString(),
    };
    await this.store.saveAuthorizationCode(record);
    return record;
  }

  async exchangeCode({ code, clientId, clientSecret, redirectUri, codeVerifier }) {
    const app = await this.getApp(clientId);
    if (!app) throw new Error("未知的 OIDC 客户端");
    if (!app.isActive) throw new Error("OIDC 客户端已停用");

    // Public clients don't require secret; confidential ones do
    if (!app.isPublic) {
      if (!timingSafeEqual(clientSecret ?? "", app.clientSecret ?? "")) {
        throw new Error("client_secret 验证失败");
      }
    }

    const record = await this.store.consumeAuthorizationCode(code);
    if (!record) throw new Error("授权码无效或已使用");
    if (new Date(record.expiresAt).getTime() < this.now().getTime()) {
      throw new Error("授权码已过期");
    }
    if (record.clientId !== clientId || record.redirectUri !== redirectUri) {
      throw new Error("授权码请求不一致");
    }
    if (record.codeChallenge) {
      await verifyPkce(record, codeVerifier);
    }

    const user = await this.store.getUserById(record.userId);
    if (!user || !user.isActive) throw new Error("找不到授权码对应用户或已停用");

    const idToken = await this.createIdToken({ user, nonce: record.nonce, clientId });
    return {
      access_token: await this.createAccessToken(user, clientId),
      token_type: "Bearer",
      expires_in: this.config.tokenTtlSeconds,
      id_token: idToken,
      scope: record.scope,
    };
  }

  async createIdToken({ user, nonce, clientId }) {
    const privateJwk = this.requirePrivateJwk();
    const name = splitDisplayName(user.displayName, user.email);
    const claims = {
      iss: this.config.issuer,
      sub: String(user.id),
      aud: clientId,
      email: user.email,
      email_verified: Boolean(user.emailVerified),
      name: user.displayName,
      given_name: name.givenName,
      family_name: name.familyName,
      preferred_username: user.email.split("@")[0],
    };
    if (nonce) claims.nonce = nonce;
    return signJwt({
      privateJwk,
      claims,
      now: this.now,
      ttlSeconds: this.config.tokenTtlSeconds,
    });
  }

  async createAccessToken(user, clientId) {
    const privateJwk = this.requirePrivateJwk();
    return signJwt({
      privateJwk,
      claims: {
        iss: this.config.issuer,
        sub: String(user.id),
        aud: clientId,
        email: user.email,
      },
      now: this.now,
      ttlSeconds: this.config.tokenTtlSeconds,
    });
  }

  async getUserInfoById(userId) {
    const user = await this.store.getUserById(userId);
    if (!user) throw new Error("找不到用户");
    const name = splitDisplayName(user.displayName, user.email);
    return {
      sub: String(user.id),
      email: user.email,
      email_verified: Boolean(user.emailVerified),
      name: user.displayName,
      given_name: name.givenName,
      family_name: name.familyName,
      preferred_username: user.email.split("@")[0],
    };
  }

  requirePrivateJwk() {
    if (!this.config.privateJwk) {
      throw new Error("缺少必要配置：PRIVATE_JWK");
    }
    return parsePrivateJwk(this.config.privateJwk);
  }
}

export function parsePrivateJwk(value) {
  try {
    const jwk = JSON.parse(value);
    if (!jwk.kid) throw new Error("PRIVATE_JWK 必须包含 kid");
    return jwk;
  } catch (error) {
    if (error.message === "PRIVATE_JWK 必须包含 kid") throw error;
    throw new Error("PRIVATE_JWK 必须是有效的单行 JSON");
  }
}

function splitDisplayName(displayName, email) {
  const fallback = email ? email.split("@")[0] : "User";
  const parts = String(displayName || fallback).trim().split(/\s+/).filter(Boolean);
  const givenName = parts[0] || fallback;
  const familyName = parts.length > 1 ? parts.slice(1).join(" ") : givenName;
  return { givenName, familyName };
}

async function verifyPkce(record, verifier) {
  if (!verifier) throw new Error("缺少 PKCE code_verifier");
  const method = record.codeChallengeMethod || "plain";
  if (method === "S256") {
    const expected = await sha256Base64Url(verifier);
    if (!timingSafeEqual(expected, record.codeChallenge)) throw new Error("PKCE 验证失败");
  } else if (method === "plain") {
    if (!timingSafeEqual(verifier, record.codeChallenge)) throw new Error("PKCE 验证失败");
  } else {
    throw new Error("不支持的 PKCE 方法");
  }
}

export { exportPublicJwk };
