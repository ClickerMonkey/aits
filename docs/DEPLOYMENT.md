# Deployment Documentation

This document describes the automated deployment process for the @aeye project.

## GitHub Action: Deploy Cletus

The `deploy-cletus.yml` workflow automatically deploys the project to a remote machine when code is pushed to the `main` branch.

### Workflow Behavior

- **Triggers**: Automatically on push to `main` branch, or manually via workflow_dispatch
- **Conditional Execution**: Only runs if SSH secrets are configured and the machine is reachable
- **Safe Failure**: If secrets are missing or the machine is unreachable, the workflow completes successfully without deploying

### Required GitHub Secrets

To enable automatic deployment, configure the following secrets in your GitHub repository:

| Secret Name | Description | Example | Required |
|------------|-------------|---------|----------|
| `DEPLOY_SSH_HOST` | Remote machine hostname or IP address | `example.com` or `192.168.1.100` | Yes |
| `DEPLOY_SSH_USER` | SSH username for authentication | `deployer` or `ubuntu` | Yes |
| `DEPLOY_SSH_KEY` | SSH private key for authentication | Contents of `~/.ssh/id_rsa` | Yes |
| `DEPLOY_SSH_PORT` | SSH port (optional, defaults to 22) | `2222` | No |
| `DEPLOY_PATH` | Deployment directory path (optional) | `~/aeye` or `/opt/aeye` | No |

#### Setting Up Secrets

1. Navigate to your GitHub repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each required secret

### SSH Key Setup

#### 1. Generate SSH Key Pair (if you don't have one)

```bash
# Generate a new SSH key pair
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/aeye_deploy_key

# Or use RSA if ed25519 is not supported
ssh-keygen -t rsa -b 4096 -C "github-deploy" -f ~/.ssh/aeye_deploy_key
```

#### 2. Add Public Key to Remote Machine

```bash
# Copy public key to remote machine
ssh-copy-id -i ~/.ssh/aeye_deploy_key.pub user@remote-host

# Or manually add to authorized_keys
cat ~/.ssh/aeye_deploy_key.pub | ssh user@remote-host 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'
```

#### 3. Add Private Key to GitHub Secrets

```bash
# Display private key
cat ~/.ssh/aeye_deploy_key

# Copy the entire output (including -----BEGIN... and -----END... lines)
# Paste into GitHub secret DEPLOY_SSH_KEY
```

### Remote Machine Requirements

The remote machine must have:

- **Node.js** 16.0.0 or higher (recommended: Node.js 20)
- **npm** package manager
- **git** (optional, for cloning)
- **tar** and **gzip** (usually pre-installed)
- **SSH server** running and accessible

#### Installing Node.js on Remote Machine

```bash
# Using NodeSource repository (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Using nvm (any Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### Deployment Process

When triggered, the workflow:

1. ✅ **Checks out** the repository code
2. ✅ **Sets up** Node.js environment
3. ✅ **Configures** SSH authentication
4. ✅ **Tests** SSH connection to remote machine
5. ✅ **Creates** deployment package (excludes node_modules, .git, etc.)
6. ✅ **Copies** package to remote machine via SCP
7. ✅ **Extracts** package on remote machine
8. ✅ **Installs** npm dependencies
9. ✅ **Builds** all packages in the monorepo
10. ✅ **Cleans up** temporary files

### Deployment Directory Structure

After deployment, the remote machine will have:

```
~/aeye/                           # Default DEPLOY_PATH
├── packages/
│   ├── core/
│   │   └── dist/                 # Built package
│   ├── ai/
│   │   └── dist/                 # Built package
│   ├── openai/
│   │   └── dist/                 # Built package
│   ├── openrouter/
│   │   └── dist/                 # Built package
│   ├── replicate/
│   │   └── dist/                 # Built package
│   ├── aws/
│   │   └── dist/                 # Built package
│   ├── models/
│   │   └── dist/                 # Built package
│   ├── cletus/
│   │   └── dist/
│   │       └── index.js          # Built Cletus CLI
│   └── test-integration/
│       └── dist/                 # Built integration tests
├── node_modules/                 # Installed dependencies
├── package.json
└── ...
```

### Using Deployed Cletus

After deployment, you can run Cletus on the remote machine:

```bash
# SSH into the remote machine
ssh user@remote-host

# Navigate to deployment directory
cd ~/aeye

# Run Cletus
./packages/cletus/dist/index.js

# Or if you want to link it globally
npm link packages/cletus
cletus
```

### Monitoring Deployments

View deployment status in GitHub:

1. Go to your repository
2. Click **Actions** tab
3. Select **Deploy Cletus** workflow
4. View recent workflow runs

Each deployment shows:
- Connection test results
- Installation progress
- Build output
- Any errors encountered

### Troubleshooting

#### Deployment Not Running

**Symptom**: Workflow doesn't execute on push to main

**Solutions**:
- Verify all required secrets (DEPLOY_SSH_HOST, DEPLOY_SSH_USER, DEPLOY_SSH_KEY) are configured
- Check that the workflow file exists at `.github/workflows/deploy-cletus.yml`
- Ensure you're pushing to the `main` branch

#### SSH Connection Failed

**Symptom**: "SSH connection failed - machine may be unreachable"

**Solutions**:
- Verify the remote host is online and accessible
- Check firewall rules allow SSH connections
- Verify SSH_PORT is correct (default: 22)
- Test SSH connection manually: `ssh -i /path/to/key user@host`
- Ensure public key is in remote machine's `~/.ssh/authorized_keys`

#### Build Failures

**Symptom**: Deployment succeeds but build fails

**Solutions**:
- Check Node.js version on remote machine (requires 16.0.0+)
- Verify npm is installed
- Check disk space: `df -h`
- Review build logs in GitHub Actions
- SSH into remote machine and manually run: `cd ~/aeye && npm run build`

#### Permission Denied

**Symptom**: Cannot write to deployment directory

**Solutions**:
- Verify the SSH user has write permissions to DEPLOY_PATH
- Create directory manually: `ssh user@host "mkdir -p ~/aeye"`
- Change ownership: `ssh user@host "sudo chown -R $USER ~/aeye"`

### Manual Deployment

If automatic deployment fails, you can deploy manually:

```bash
# 1. Clone repository on remote machine
ssh user@remote-host
git clone https://github.com/ClickerMonkey/aeye.git ~/aeye
cd ~/aeye

# 2. Install dependencies
export PUPPETEER_SKIP_DOWNLOAD=true
npm install --legacy-peer-deps

# 3. Build all packages
npm run build

# 4. Run Cletus
./packages/cletus/dist/index.js
```

### Security Considerations

- ✅ **SSH Key**: Use a dedicated SSH key for deployments (not your personal key)
- ✅ **Secrets**: Never commit SSH keys or secrets to the repository
- ✅ **Access**: Limit SSH key permissions on remote machine
- ✅ **User**: Consider using a dedicated deployment user with minimal privileges
- ✅ **Firewall**: Restrict SSH access to specific IP ranges if possible
- ✅ **Audit**: Regularly review GitHub Actions logs for unauthorized access attempts

### Disabling Automatic Deployment

To disable automatic deployment:

1. **Remove secrets**: Delete the SSH secrets from GitHub repository settings
2. **Disable workflow**: Rename or delete `.github/workflows/deploy-cletus.yml`
3. **Conditional disable**: The workflow automatically skips if secrets are not present

### Environment Variables

The remote machine deployment does not set up environment variables. If your application requires environment variables (API keys, etc.), you must configure them manually:

```bash
# SSH into remote machine
ssh user@remote-host

# Create .env file
cd ~/aeye/packages/cletus
cat > .env << EOF
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
REPLICATE_API_KEY=r8_...
EOF

chmod 600 .env
```

### Advanced Configuration

#### Custom Build Commands

To run additional commands during deployment, modify the workflow's SSH section:

```yaml
ssh -i ~/.ssh/deploy_key -p $SSH_PORT $SSH_USER@$SSH_HOST << 'ENDSSH'
  cd $DEPLOY_PATH
  # Your custom commands here
  npm run custom-build-step
  npm run migrate-database
ENDSSH
```

#### Multiple Environments

To deploy to multiple environments (staging, production):

1. Create separate workflows: `deploy-staging.yml`, `deploy-production.yml`
2. Use different secrets: `STAGING_SSH_HOST`, `PROD_SSH_HOST`, etc.
3. Trigger based on branch or tags

#### Notifications

Add notification steps to alert on deployment status:

```yaml
- name: Notify on success
  if: success()
  run: |
    # Send success notification (Slack, Discord, email, etc.)
```

## Support

For issues with deployment:

1. Check GitHub Actions logs
2. Review this documentation
3. Test SSH connection manually
4. Open an issue on [GitHub](https://github.com/ClickerMonkey/aeye/issues)
