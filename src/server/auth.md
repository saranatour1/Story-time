# Story-time auth.md

For AI agents, and the people who run them, that want to call Story-time's API. Served at /auth.md.

An agent can't register with Story-time or get credentials of its own. It can only use a credential a person gives it.

## Registration

There is no registration or provisioning endpoint: no agent accounts, client IDs or API keys. There is no OAuth authorization server for agents either, so this site publishes no OAuth metadata. A person makes an account by signing in with Google or GitHub on the home page: https://story-time.saranatour.dev/

## Supported methods

- **Bearer token:** `Authorization: Bearer <token>`. A person's access token, issued to their browser when they sign in. It lasts 15 minutes and can do what that person can do.
- **Share token:** `Authorization: Share <token>`. The key after the `#` in a share link. It reads the photos of that one shared experience, and stops working when the owner switches the link off.

## Using a credential

- Use a credential only when the person it belongs to asks you to.
- Send it in the `Authorization` header, never in a URL. Don't store it, log it or pass it on.
- When a bearer token expires, ask the person for a new one. There is no refresh flow for agents.
- `401` means the credential is missing. `404` means the thing doesn't exist or this credential can't see it.

The endpoints are described at /openapi.json.
