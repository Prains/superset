-- Seeds user_identities from GitHub sign-ins, so the people filter and `me`
-- work without every member first clicking connect in every organization.
--
-- auth.accounts.account_id for provider_id='github' is GitHub's numeric user
-- id, which is exactly what webhook payloads carry as sender.id.
--
-- Scoped to organizations that actually have a GitHub installation: elsewhere
-- no GitHub event can ever arrive, so an identity row there would be noise.
-- That is 2,029 rows rather than 29,190.
--
-- handle is left null. The sign-in record has no login, and nothing needs one
-- to match — it fills in when a picker or a sync first fetches it.
INSERT INTO "user_identities" (
	"user_id",
	"organization_id",
	"provider",
	"external_id",
	"external_scope_id",
	"handle"
)
SELECT DISTINCT
	a."user_id",
	m."organization_id",
	'github',
	a."account_id",
	NULL,
	NULL
FROM "auth"."accounts" a
JOIN "auth"."members" m ON m."user_id" = a."user_id"
JOIN "github_installations" gi ON gi."organization_id" = m."organization_id"
WHERE a."provider_id" = 'github'
ON CONFLICT DO NOTHING;
