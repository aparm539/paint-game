# Production Deployment Guide

This guide covers deploying the Dice Game multiplayer application to a VPS (Virtual Private Server).

## Prerequisites

Before deploying, ensure your VPS has:

- **Node.js 18+** and npm installed
- **Git** for cloning the repository
- **PM2** installed globally: `npm install -g pm2`
- Sufficient RAM (minimum 512MB recommended)
- Open ports: 
  - Port 3000 (or your chosen PORT) for the application
  - Port 80/443 if using a reverse proxy (recommended)

## Initial VPS Setup

### 1. Connect to Your VPS

```bash
ssh user@your-vps-ip
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
git clone <your-repository-url> dice-game
cd dice-game
```

## Configuration

### 1. Set Up Environment Variables

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

**Important:** Replace `your-domain.com` with your actual domain or VPS IP address.

```bash
# Client environment (for rebuilding if needed)
cp client/.env.example client/.env
nano client/.env
```

**Edit `client/.env` with your production values:**

```env
VITE_SERVER_URL=http://your-domain.com:3000
```

### 2. Update PM2 Configuration

Edit `ecosystem.config.js` to update the `cwd` path:

```bash
nano ecosystem.config.js
```

Change the `cwd` value from `/Users/sunny/dice-game` to your actual deployment path (e.g., `/home/youruser/dice-game`).

## Building and Deployment

### Option 1: Using the Deployment Script (Recommended)

Make the deployment script executable and run it:

```bash
chmod +x deploy.sh
./deploy.sh
```

This script will:
1. Install all dependencies
2. Build the client with production settings
3. Build the server
4. Start the application with PM2

### Option 2: Manual Deployment

If you prefer to deploy manually:

```bash
# 1. Install dependencies
npm install

# 2. Build the client
cd client
npm run build
cd ..

# 3. Build the server
cd server
npm run build
cd ..

# 4. Create logs directory
mkdir -p logs

# 5. Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
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

## Updating the Application

When you need to deploy updates:

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install any new dependencies
npm install

# 3. Rebuild client and server
cd client && npm run build && cd ..
cd server && npm run build && cd ..

# 4. Restart with PM2
pm2 restart dice-game
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
- Check the logs: `pm2 logs dice-game`
- Review the main README.md for game mechanics
- Verify your environment configuration matches production requirements

