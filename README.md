# EventLink Backend

Express API for the EventLink event-ticketing prototype. It owns authentication, event and ticket records, webhook handlers, email delivery, and the server-side Stellar mint helper. The React application and Soroban contract are maintained separately.

> **Project status:** This is an open-source prototype, not a production payment processor. The frontend checkout currently simulates payment references; webhook routes do not make that checkout a verified, live payment integration. Review the security limitations below before deploying.

## Repositories

| Project | Repository |
| --- | --- |
| Frontend | [EVENT_LINK](https://github.com/orbit-flow-labs/EVENT_LINK) |
| Backend API | [EVENT_LINK_BACKEND-](https://github.com/orbit-flow-labs/EVENT_LINK_BACKEND-) |
| Soroban contract | [EVENT_LINK_CONTRACT](https://github.com/orbit-flow-labs/EVENT_LINK_CONTRACT) |

## Requirements

- Node.js 22 or newer and npm
- MongoDB is optional for local development. If unavailable, the API uses an in-memory store; data in that store is lost when the process restarts.

## Local development

```sh
git clone https://github.com/orbit-flow-labs/EVENT_LINK_BACKEND-.git
cd EVENT_LINK_BACKEND-
npm ci
cp .env.example .env
npm run dev
```

The API listens on `http://localhost:3001` by default. Run the frontend in a second terminal and point `VITE_API_BASE_URL` to this URL. Set `FRONTEND_URL` to the frontend origin; it is used when creating claim links.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Service status and route summary |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Register an account |
| `POST` | `/api/auth/login` | Log in |
| `GET` | `/api/auth/me` | Read the current account |
| `GET` | `/api/auth/users` | List users (development/admin surface) |
| `GET`, `POST` | `/api/events` | List and create events |
| `GET` | `/api/tickets` | List ticket records |
| `POST` | `/api/tickets/purchase` | Create a ticket record from validated purchase metadata |
| `POST` | `/api/tickets/claim` | Claim a ticket to a wallet address |
| `POST` | `/api/tickets/send-progress-email` | Send a workflow email |
| `POST` | `/api/webhooks/stripe` | Receive a Stripe event |
| `POST` | `/api/webhooks/flutterwave` | Receive a Flutterwave event |
| `GET` | `/api/webhooks/logs` | Inspect in-memory webhook deduplication state |

The purchase endpoint validates contact and amount fields, but it is not a payment authorization endpoint. Provider webhooks are the intended integration boundary; use real provider signature verification and idempotent durable storage before production use.

## Configuration

Copy `.env.example` and set values for the environment. Never commit `.env` files or credentials.

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | Production | Set to `production` to enable required-secret checks |
| `PORT` | No | HTTP port; defaults to `3001` |
| `FRONTEND_URL` | No | Frontend origin used in generated claim URLs |
| `JWT_SECRET` | Production | Random secret, at least 32 characters |
| `MONGODB_URI` | No | MongoDB connection string; memory storage is used otherwise |
| `SMTP_HOST`, `SMTP_PORT` | No | SMTP server settings |
| `SMTP_USER`, `SMTP_PASS` | No | SMTP credentials for email delivery |
| `STRIPE_WEBHOOK_SECRET` | Production | Stripe webhook signing secret |
| `FLUTTERWAVE_SECRET_HASH` | Production | Flutterwave webhook verification hash |
| `SOROBAN_CONTRACT_ID` | No | Contract identifier included in minted ticket records |
| `STELLAR_NETWORK` | No | Explicit Stellar network name; Friendbot requires `testnet` |
| `STELLAR_HORIZON_URL` | No | Horizon endpoint; defaults to Stellar Testnet |
| `STELLAR_FRIENDBOT_ENABLED` | Development | Must be `true` to fund accounts from Friendbot; ignored in production |

## Commands and CI

```sh
npm ci
npm run typecheck
npm run dev
npm start
```

GitHub Actions runs a clean install and TypeScript typecheck for pull requests and pushes to `main`.

## Security and known limitations

- Keep JWT, SMTP, and payment-provider secrets in the deployment environment, never in source or frontend variables.
- Use HTTPS and restrict CORS to the actual frontend origin before deploying.
- The current event and ticket fallback store, webhook deduplication set, and webhook logs are process-local, not durable.
- Review authentication and authorization on every route before production. Do not expose development/admin endpoints publicly without access controls.
- The Stellar helper defaults to Testnet; configure `STELLAR_NETWORK` to select Testnet or Public. Do not treat generated demo references or fallback transaction hashes as confirmed settlement.

## Contributing

1. Open or find an issue describing the change; coordinate any API contract change with the frontend and contract repositories.
2. Create a focused branch and keep commits scoped to one behavior.
3. Run `npm ci` and `npm run typecheck` before opening a pull request.
4. Include the issue or Drips Wave task reference, test evidence, and any environment changes in the PR description.
5. Never include secrets, production data, or real customer information in code or test fixtures.

Please follow the program's current Drips Wave 10 contribution rules where they apply; this repository does not imply program sponsorship or acceptance.

## License

MIT. See [LICENSE](LICENSE).