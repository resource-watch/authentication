# 1.1.1

## 30/03/2021

- Fix issue in pagination links returned from the GET users response.

# 1.1.0

## 26/03/2021

- Add `sign-up-redirect` endpoint to redirect users to referrer of sign up call (stored in user).

## 25/03/2021

- Add call to Okta delete session endpoint on logout.

## 09/02/2021

- Prefer `authorization` header over `authentication`.
- `authentication` header support deprecated

## 25/01/2021

- Add redirection to `config.publicUrl` to account for `passport-twitter` only supporting a single source host. 

## 18/01/2021

- Streamline response structure for user management endpoints.

## 11/12/2020

- Serialize user in `/apple/token` endpoint to avoid mongoose data leakage.

# v1.0.0

## 29/10/2020

- Initial commit from Control Tower's code.
