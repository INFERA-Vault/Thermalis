# Emergency Dispatch Runbook

This runbook describes the optional alerting layer for PS-162. It is designed for controlled deployment with verified, operator-owned recipients. It must not be treated as an automatic replacement for a public emergency call centre or a human incident commander.

## Novelty flow

```text
Thermal anomaly
    -> TCEF-v1 evidence fusion
    -> classified alert with severity and confidence
    -> location-aware recipient selection
    -> email / SMS / voice / webhook dispatch
    -> auditable delivery status
    -> human verification and response
```

Dispatch is deliberately fail-closed. It is disabled by default, does not discover or guess emergency contact numbers, and only sends to recipients explicitly registered and marked as verified by an operator.

## Supported channels

- Email: SMTP settings already used by the alert notification service.
- SMS and voice: Twilio-compatible REST endpoints.
- Webhook: HTTPS JSON POST for an approved control-room, incident-management, or integration endpoint.

The implementation sends a concise automated warning containing the event, severity, confidence, location, class, and a dashboard link. The message says that it is an automated decision-support signal and must be verified by a human.

## Configuration

Start with dispatch disabled:

```dotenv
EMERGENCY_DISPATCH_ENABLED=False
EMERGENCY_ADMIN_KEY=replace_with_a_long_random_operator_key
EMERGENCY_MIN_SEVERITY=HIGH
EMERGENCY_DEFAULT_RADIUS_METERS=5000
EMERGENCY_MAX_RECIPIENTS=20
EMERGENCY_REQUEST_TIMEOUT_SECONDS=10

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_PHONE=
TWILIO_API_BASE=https://api.twilio.com/2010-04-01
```

Never commit real credentials. Use a secret manager or protected deployment environment for production values.

## Registering recipients

Recipient administration is protected with the `X-Emergency-Admin-Key` header. Register only official, approved endpoints. Do not enter guessed phone numbers or public numbers copied from an unverified source.

Example site-control-room email recipient:

```powershell
$headers = @{ "X-Emergency-Admin-Key" = $env:EMERGENCY_ADMIN_KEY }
$body = @{
  name = "Site control room"
  organization = "Example Industrial Site"
  recipient_type = "SITE_OPERATOR"
  channel = "EMAIL"
  endpoint = "control-room@example.org"
  location_latitude = 28.6139
  location_longitude = 77.2090
  coverage_radius_meters = 5000
  minimum_severity = "HIGH"
  enabled = $true
  verified = $true
  priority = 1
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8001/api/v1/emergency/recipients" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Recipients with coordinates are selected only when the alert is within their coverage radius. A verified recipient without coordinates is treated as a deliberately configured global contact, so use that only for an approved central control room or dispatch integration.

## Dispatch lifecycle

Each attempt is stored in `alert_dispatches`:

- `PENDING`: an attempt has been created and is in progress.
- `SENT`: the provider accepted the message.
- `FAILED`: the provider rejected the request or the adapter failed.
- `SKIPPED`: reserved for explicitly skipped delivery paths.

Dispatch is idempotent for successful attempts. Re-running the same alert does not send duplicate messages unless `force=true` is explicitly requested by an authenticated operator.

## Monitoring and manual dispatch

Check configuration without exposing secrets:

```text
GET /api/v1/emergency/status
```

Review existing attempts:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:8001/api/v1/emergency/dispatches/ALERT_ID" `
  -Headers $headers
```

Trigger a controlled manual retry:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8001/api/v1/emergency/dispatch/ALERT_ID?force=true" `
  -Headers $headers
```

Use a provider sandbox or an internal test endpoint before enabling real recipients.

## Go-live checklist

1. Define the incident policy, severity threshold, escalation ownership, and acknowledgement procedure.
2. Obtain official contact endpoints from the responsible facility and public agencies.
3. Register recipients and verify each endpoint out-of-band.
4. Test email, SMS, voice, and webhook delivery in sandbox mode.
5. Confirm messages include the automated-signal disclaimer and dashboard location.
6. Confirm operators can review, acknowledge, suppress, and resolve incidents through the operational process.
7. Confirm dispatch records and provider IDs are retained for audit.
8. Enable dispatch only after a human owner signs off.
9. Review false positives, delivery failures, and recipient coverage after every exercise or incident.

## Safety boundaries

This system classifies satellite-derived evidence; it does not confirm that a fire exists and cannot guarantee real-time emergency response. Emergency calls must follow the deployment authority's approved protocol. Keep a human in the loop for confirmation, escalation, and public warning decisions.
