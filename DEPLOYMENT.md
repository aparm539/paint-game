# Production Deployment Guide

This guide covers deploying the Dice Game multiplayer application to a DigitalOcean Droplet using automated CI/CD via GitHub Actions.

## Deployment Overview

The application uses **automated continuous deployment**. When you push to the `main` branch, GitHub Actions automatically:

1. Connects to your DigitalOcean droplet via SSH
2. Pulls the latest code
3. Installs dependencies
4. Builds the client and server
5. Restarts the application with PM2

## Prerequisites

### GitHub Repository Secrets

Configure the following secrets in your GitHub repository (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `DROPLET_SSH_KEY` | Private SSH key (ed25519) for connecting to the droplet |
| `DROPLET_HOST` | IP address or hostname of your DigitalOcean droplet |
| `DROPLET_USER` | SSH username for the droplet (e.g., `root` or a sudo user) |

### DigitalOcean Droplet Requirements

Ensure your droplet has:

- **Node.js 18+** and npm installed
- **Git** for pulling updates
- **PM2** installed globally: `npm install -g pm2`
- Sufficient RAM (minimum 512MB recommended)
- SSH key authentication configured
- Open ports:
  - Port 22 for SSH
  - Port 3000 (or your chosen PORT) for the application
  - Port 80/443 if using a reverse proxy (recommended)

## Initial Droplet Setup (One-Time)

### 1. Connect to Your Droplet

```bash
ssh user@your-droplet-ip
```

### 2. Install Node.js (if not already installed)

```bash
# Using NodeSource repository for Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 3. Install PM2 Globally

```bash
sudo npm install -g pm2
```

### 4. Clone the Repository

```bash
cd ~
git clone <your-repository-url> paint-game
cd paint-game
```

**Note:** The CI/CD workflow expects the repository to be cloned to `~/paint-game` on the droplet.

### 5. Set Up Environment Variables

Create environment files from the examples:

```bash
# Server environment
cp server/.env.example server/.env
nano server/.env
```

**Edit `server/.env` with your production values:**

```env
PORT=3000
CORS_ORIGIN=http://your-domain.com,https://your-domain.com
NODE_ENV=production
```

**Important:** Replace `your-domain.com` with your actual domain or droplet IP address.

```bash
# Client environment (for rebuilding if needed)
cp client/.env.example client/.env
nano client/.env
```

**Edit `client/.env` with your production values:**

```env
VITE_SERVER_URL=http://your-domain.com:3000
```

### 6. Update PM2 Configuration

Edit `ecosystem.config.js` to update the `cwd` path:

```bash
nano ecosystem.config.js
```

Change the `cwd` value to your actual deployment path (e.g., `/home/youruser/paint-game` or `/root/paint-game`).

### 7. Initial Manual Deployment

For the first deployment, run manually:

```bash
# Install dependencies
npm install

# Build the client
cd client
npm install
npm run build
cd ..

# Build the server
cd server
npm install
npm run build
cd ..

# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Automated Deployment (CI/CD)

After the initial setup, all subsequent deployments are automatic:

1. **Push to main branch** - Commit and push your changes to the `main` branch
2. **GitHub Actions triggers** - The deployment workflow runs automatically
3. **Droplet updates** - The workflow SSHs into your droplet and deploys the changes

### What the CI/CD Pipeline Does

```yaml
# On every push to main:
1. Checkout code
2. Set up SSH connection using secrets
3. SSH to droplet and run:
   - git fetch origin && git reset --hard origin/main
   - npm install (root dependencies)
   - cd client && npm install && npm run build
   - cd server && npm install && npm run build
   - pm2 startOrReload ecosystem.config.js --update-env
   - pm2 save
```

### Monitoring Deployments

- View deployment status in GitHub → Actions tab
- Check logs for any failures
- Green checkmark = successful deployment

## Manual Deployment (Alternative)

If you need to deploy manually without CI/CD:

### Using the Deployment Script

SSH into your droplet and run:

```bash
cd ~/paint-game
chmod +x deploy.sh
./deploy.sh
```

## Updating the Application

### Automatic Updates (Recommended)

Simply push to the `main` branch:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

The CI/CD pipeline will handle the rest automatically.

### Manual Updates

If you need to update manually on the droplet:

```bash
ssh user@your-droplet-ip
cd ~/paint-game

# Pull latest changes
git pull origin main

# Install dependencies and rebuild
npm install
cd client && npm install && npm run build && cd ..
cd server && npm install && npm run build && cd ..

# Restart with PM2
pm2 restart dice-game
```

## Managing the Application

### Start the Application

```bash
pm2 start ecosystem.config.js
```

### Stop the Application

```bash
pm2 stop dice-game
```

### Restart the Application

```bash
pm2 restart dice-game
```

### View Logs

```bash
# View all logs
pm2 logs dice-game

# View only error logs
pm2 logs dice-game --err

# View only output logs
pm2 logs dice-game --out
```

### Check Application Status

```bash
pm2 status
pm2 info dice-game
```

### Monitor Resources

```bash
pm2 monit
```

## Health Check

Verify the application is running:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-11-05T12:34:56.789Z"}
```

## Setting Up PM2 on System Boot

To ensure your application starts automatically when the VPS reboots:

```bash
# Save current PM2 process list
pm2 save

# Generate and configure startup script
pm2 startup

# Follow the command output instructions (usually requires sudo)
```

## Optional: Setting Up Nginx Reverse Proxy

For production, it's recommended to use Nginx as a reverse proxy:

### 1. Install Nginx

```bash
sudo apt-get update
sudo apt-get install nginx
```

### 2. Configure Nginx

Create a new configuration file:

```bash
sudo nano /etc/nginx/sites-available/dice-game
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket support for Socket.io
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Enable the Configuration

```bash
sudo ln -s /etc/nginx/sites-available/dice-game /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Update Environment Variables

After setting up Nginx, update your environment files to use port 80 instead of 3000:

- Update `CORS_ORIGIN` in `server/.env`
- Update `VITE_SERVER_URL` in `client/.env` to use your domain without the port
- Rebuild the client: `cd client && npm run build`
- Restart PM2: `pm2 restart dice-game`

## Firewall Configuration

If using UFW firewall:

```bash
# Allow SSH (important!)
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# If not using Nginx, allow your application port
sudo ufw allow 3000

# Enable firewall
sudo ufw enable
```

## Troubleshooting

### CI/CD Deployment Fails

1. Check GitHub Actions logs in the Actions tab
2. Verify GitHub secrets are configured correctly:
   - `DROPLET_SSH_KEY` - Must be a valid private key
   - `DROPLET_HOST` - Correct IP/hostname
   - `DROPLET_USER` - User with SSH access
3. Ensure SSH key is added to droplet's authorized_keys
4. Check droplet is accessible and running

### Application Won't Start

1. Check PM2 logs:
   ```bash
   pm2 logs dice-game --lines 100
   ```

2. Verify Node.js version:
   ```bash
   node --version  # Should be 18+
   ```

3. Check if port is already in use:
   ```bash
   sudo lsof -i :3000
   ```

### Cannot Connect from Browser

1. Verify the application is running:
   ```bash
   pm2 status
   curl http://localhost:3000/health
   ```

2. Check firewall settings:
   ```bash
   sudo ufw status
   ```

3. Verify CORS_ORIGIN includes your client domain

4. Check server logs for errors:
   ```bash
   pm2 logs dice-game --err
   ```

### WebSocket Connection Fails

1. Ensure your reverse proxy (if using one) supports WebSocket upgrade
2. Check that `VITE_SERVER_URL` in the client matches your server URL
3. Verify Socket.io is properly configured with CORS

### High Memory Usage

1. Monitor with PM2:
   ```bash
   pm2 monit
   ```

2. Adjust `max_memory_restart` in `ecosystem.config.js` if needed

3. Consider increasing VPS resources if consistently hitting limits

## Security Best Practices

1. **Use HTTPS**: Set up SSL/TLS certificates (Let's Encrypt recommended)
2. **Keep Updated**: Regularly update Node.js, npm, and dependencies
3. **Environment Variables**: Never commit `.env` files to version control
4. **Firewall**: Only open necessary ports
5. **User Permissions**: Don't run the application as root
6. **Rate Limiting**: Consider adding rate limiting for production use
7. **Regular Backups**: Back up your application and data regularly

## Monitoring

Consider setting up monitoring tools:

- **PM2 Plus**: Advanced monitoring (https://pm2.io/)
- **Uptime Monitoring**: UptimeRobot, Pingdom, or similar
- **Log Aggregation**: Consider tools like Papertrail or Loggly

## Support

For issues or questions:
- Check GitHub Actions logs for deployment failures
- Check PM2 logs: `pm2 logs dice-game`
- Review the main README.md for game mechanics
- Verify your environment configuration matches production requirements

