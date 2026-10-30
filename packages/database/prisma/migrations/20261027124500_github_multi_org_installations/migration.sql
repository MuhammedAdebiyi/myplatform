-- One GitHub installation may be linked by multiple platform organizations
-- (a user's personal account install is shared across their orgs), and each
-- org-scoped copy keeps its own repository rows.

-- DropIndex
DROP INDEX "GitHubInstallation_installationId_key";

-- CreateIndex
CREATE UNIQUE INDEX "GitHubInstallation_organizationId_installationId_key" ON "GitHubInstallation"("organizationId", "installationId");

-- DropIndex
DROP INDEX "GitHubRepository_githubRepoId_key";

-- CreateIndex
CREATE UNIQUE INDEX "GitHubRepository_installationId_githubRepoId_key" ON "GitHubRepository"("installationId", "githubRepoId");
