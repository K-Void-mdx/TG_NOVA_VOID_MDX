# NOVA_VOID MDX - Deployment & Best Practices Guide

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Instructions](#deployment-instructions)
3. [Production Configuration](#production-configuration)
4. [Monitoring & Maintenance](#monitoring--maintenance)
5. [Troubleshooting](#troubleshooting)
6. [Security Hardening](#security-hardening)
7. [Performance Optimization](#performance-optimization)
8. [Best Practices](#best-practices)

---

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests pass: `npm test`
- [ ] No syntax errors: `npm run check`
- [ ] No security vulnerabilities: `npm audit`
- [ ] Code review completed
- [ ] Git history is clean

### Message Formatting
- [ ] ✅ HTML escaping implemented in all Telegram messages
- [ ] ✅ Small-caps formatting consistent across platforms
- [ ] ✅ Error messages are properly formatted
- [ ] ✅ No user input is rendered unsanitized
- [ ] ✅ All callback answers use consistent styling

### Configuration
- [ ] `.env` file is configured correctly
- [ ] All required environment variables are set
- [ ] Telegram bot token is valid
- [ ] WhatsApp authentication is ready
- [ ] AI provider keys are configured (if needed)

### Documentation
- [ ] README.md is up to date
- [ ] CHANGELOG.md reflects all changes
- [ ] Installation guide is accurate
- [ ] Configuration examples are correct

---

## Deployment Instructions

### 1. Local Testing

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Check for syntax errors
npm run check

# Security audit
npm audit

# Start in development mode
npm start
```

### 2. Environment Setup

```bash
# Copy example configuration
cp .env.example .env

# Edit with your actual values
nano .env
```

**Required environment variables:**
```env
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_OWNER_ID=your_telegram_id
TELEGRAM_CHANNEL=@your_channel
TELEGRAM_GROUP=@your_group

# WhatsApp
OWNER_NAME=Your Name
OWNER_NUMBER=+1234567890
OWNER_JIDS=1234567890@s.whatsapp.net

# AI Providers (at least one)
GEMINI_API_KEY=your_key_or_leave_empty
GROQ_API_KEY=your_key_or_leave_empty
OPENROUTER_API_KEY=your_key_or_leave_empty

# Runtime
DATA_DIR=./data
DEBUG_MESSAGES=false
```

### 3. Server Deployment

#### Option A: Docker Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY src ./src
COPY .env .env

# Create data directory
RUN mkdir -p ./data

# Start application
CMD ["node", "src/index.js"]
```

**Build and run:**
```bash
# Build image
docker build -t nova-void-mdx:latest .

# Run container
docker run -d \
  --name nova-void \
  -e TELEGRAM_BOT_TOKEN="your_token" \
  -e TELEGRAM_OWNER_ID="your_id" \
  -v nova-void-data:/app/data \
  nova-void-mdx:latest
```

#### Option B: PM2 Deployment

```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem config
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'nova-void-mdx',
    script: './src/index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Enable auto-restart
pm2 startup
pm2 save
```

#### Option C: Systemd Service

```ini
# /etc/systemd/system/nova-void-mdx.service
[Unit]
Description=NOVA_VOID MDX Bot
After=network.target

[Service]
Type=simple
User=nova-void
WorkingDirectory=/home/nova-void/nova-void-mdx
ExecStart=/usr/bin/node /home/nova-void/nova-void-mdx/src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl enable nova-void-mdx
sudo systemctl start nova-void-mdx
sudo systemctl status nova-void-mdx
```

### 4. Post-Deployment Verification

```bash
# Check application is running
curl http://localhost:3000/health || echo "Application not responding"

# Test Telegram connection
# Send /start to bot - should receive welcome message

# Test WhatsApp pairing
# Send /pair in Telegram - should receive pairing code

# Monitor logs
tail -f logs/out.log
```

---

## Production Configuration

### Environment Variables

```env
# ── TELEGRAM (required) ──────────────────────────────────
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_OWNER_ID=your_numeric_id
TELEGRAM_CHANNEL=@channel_username
TELEGRAM_GROUP=@group_username
TELEGRAM_OWNER_LINK=https://t.me/your_username

# ── IDENTITY ─────────────────────────────────────────────
BOT_NAME=NOVA_VOID MDX
BOT_USERNAME=@nova_void_mdx_bot
PREFIX=.

# ── OWNER CARD ───────────────────────────────────────────
OWNER_NAME=Your Name
OWNER_NUMBER=+1234567890
OWNER_BIO=Owner & developer of NOVA_VOID MDX.

# ── WHATSAPP AUTHORITY ───────────────────────────────────
OWNER_JIDS=1234567890@s.whatsapp.net
SUDO_JIDS=

# ── AI PROVIDERS ─────────────────────────────────────────
GEMINI_API_KEY=
GROQ_API_KEY=
OPENCODE_API_KEY=
OPENROUTER_API_KEY=

# ── RUNTIME ──────────────────────────────────────────────
DATA_DIR=./data
AI_MAX_HISTORY=40
DEBUG_MESSAGES=false
```

### Security Considerations

1. **Never commit `.env` file**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use strong bot token**
   - Generate via @BotFather on Telegram
   - Keep token private and secure

3. **Restrict file permissions**
   ```bash
   chmod 600 .env
   chmod 700 data/
   ```

4. **Use environment-specific configs**
   - `.env.production` for production
   - `.env.staging` for staging
   - `.env.local` for development

5. **Rotate API keys regularly**
   - Update AI provider keys monthly
   - Use key rotation service if available

---

## Monitoring & Maintenance

### Health Checks

```bash
# Check if process is running
ps aux | grep "node src/index.js"

# Check logs for errors
grep "ERROR\|FATAL" logs/out.log

# Monitor memory usage
watch -n 5 'ps aux | grep nova-void'

# Check disk space
df -h /home/nova-void/nova-void-mdx/data/
```

### Log Management

```bash
# View live logs
tail -f logs/out.log

# Search for specific errors
grep "TELEGRAM\|WHATSAPP" logs/out.log

# Archive old logs
gzip logs/out.log.1
mv logs/out.log.1.gz logs/archive/

# Rotate logs (add to crontab)
0 0 * * * cd /home/nova-void/nova-void-mdx && npm run rotate-logs
```

### Backup Strategy

```bash
# Backup data directory daily
0 2 * * * tar -czf /backups/nova-void-$(date +\%Y\%m\%d).tar.gz \
  /home/nova-void/nova-void-mdx/data/

# Keep last 30 days of backups
find /backups -name "nova-void-*.tar.gz" -mtime +30 -delete
```

### Performance Monitoring

```bash
# Monitor CPU and memory
top -p $(pgrep -f "node src/index.js")

# Check network connections
netstat -an | grep -E "ESTABLISHED|LISTEN" | wc -l

# Monitor Telegram API calls
curl https://api.telegram.org/bot{TOKEN}/getMe

# Check WhatsApp session status
# Via Telegram: /status
```

### Maintenance Tasks

**Weekly:**
- [ ] Review error logs
- [ ] Check disk space usage
- [ ] Verify backups are being created
- [ ] Test bot commands manually

**Monthly:**
- [ ] Update dependencies: `npm update`
- [ ] Rotate API keys
- [ ] Review and archive old logs
- [ ] Performance analysis

**Quarterly:**
- [ ] Full security audit: `npm audit`
- [ ] Dependency vulnerability scan
- [ ] Update Node.js version if available
- [ ] Review production metrics

---

## Troubleshooting

### Bot Not Responding

```bash
# Check if process is running
pgrep -f "node src/index.js" || echo "Process not running"

# Check logs for errors
tail -100 logs/error.log

# Verify Telegram token
curl https://api.telegram.org/bot{TOKEN}/getMe

# Restart application
pm2 restart nova-void-mdx

# Check system resources
free -h
df -h
```

### Telegram Messages Not Sending

```bash
# Verify token format
echo $TELEGRAM_BOT_TOKEN

# Test API connection
curl -X POST https://api.telegram.org/bot{TOKEN}/sendMessage \
  -d "chat_id={CHAT_ID}&text=test"

# Check rate limiting
grep "rate.limit\|429" logs/out.log

# Verify owner ID format
# Should be numeric only, no @ symbol
```

### WhatsApp Session Disconnecting

```bash
# Check session status
# Via Telegram: /pairs

# Review session logs
tail -f logs/out.log | grep "SESSION\|BAILEYS"

# Restart specific session
# Via Telegram: /unpair {phone}
# Then: /pair {phone}

# Check browser/authentication
# Look for browser.json in data/sessions/{phone}/
```

### Performance Issues

```bash
# Check memory usage
ps aux | grep nova-void

# Monitor event loop delay
# Add to code: setInterval(() => {
#   console.log('Memory:', process.memoryUsage());
# }, 60000);

# Reduce AI history size
AI_MAX_HISTORY=20

# Restart application
pm2 restart nova-void-mdx

# Profile CPU usage
node --prof src/index.js
```

---

## Security Hardening

### Network Security

```bash
# Enable firewall
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 443/tcp # HTTPS (if needed)

# Disable unnecessary services
sudo systemctl disable telnet
sudo systemctl disable ftp

# Monitor network connections
netstat -tlnp | grep LISTEN
```

### Application Security

```bash
# Run as non-root user
sudo useradd -r -s /bin/false nova-void
sudo chown -R nova-void:nova-void /home/nova-void/nova-void-mdx

# Restrict file permissions
chmod 755 /home/nova-void/nova-void-mdx
chmod 700 /home/nova-void/nova-void-mdx/data
chmod 600 /home/nova-void/nova-void-mdx/.env

# Enable SELinux (if using Red Hat/CentOS)
semanage fcontext -a -t user_home_t /home/nova-void/nova-void-mdx
restorecon -R /home/nova-void/nova-void-mdx
```

### Dependency Security

```bash
# Regular security audits
npm audit

# Automated vulnerability scanning
npm install -g snyk
snyk test

# Keep dependencies updated
npm update
npm audit fix

# Lock dependency versions
# commitlock package-lock.json
```

### API Security

```javascript
// Implement rate limiting (already done)
const RateLimiter = require('./core/rate-limit.js');

// Log all API calls
logger.info(`[ API ] ${method} ${endpoint}`);

// Monitor for suspicious activity
if (requestsPerMinute > THRESHOLD) {
  logger.warn(`[ SECURITY ] High request rate detected`);
}

// Validate all inputs
if (!isValidPhoneNumber(phone)) {
  throw new Error('Invalid phone number');
}
```

---

## Performance Optimization

### Code Optimization

```javascript
// Use caching for frequently accessed data
const cache = new Map();
const getUser = (id) => {
  if (cache.has(id)) return cache.get(id);
  const user = fetchUser(id);
  cache.set(id, user);
  return user;
};

// Batch operations when possible
const sendBatch = (messages) => {
  return Promise.all(messages.map(msg => send(msg)));
};

// Use lazy loading
import('./heavy-module.js').then(module => {
  // Use module
});
```

### Database Optimization (if added)

```javascript
// Add indexes
db.users.createIndex({ jid: 1 });
db.sessions.createIndex({ phone: 1 });

// Use pagination for large queries
const limit = 50;
const skip = (page - 1) * limit;
const results = db.messages.find().limit(limit).skip(skip);

// Archive old data
const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
db.messages.deleteMany({ createdAt: { $lt: oneMonthAgo } });
```

### Resource Management

```javascript
// Limit concurrent connections
const MAX_CONCURRENT = 100;
const queue = [];
let current = 0;

async function queueTask(task) {
  if (current >= MAX_CONCURRENT) {
    await new Promise(resolve => queue.push(resolve));
  }
  current++;
  try {
    return await task();
  } finally {
    current--;
    const resolve = queue.shift();
    if (resolve) resolve();
  }
}

// Clean up resources
process.on('SIGTERM', async () => {
  console.log('Closing connections...');
  await db.close();
  await client.stop();
  process.exit(0);
});
```

---

## Best Practices

### Development Workflow

1. **Create feature branch**
   ```bash
   git checkout -b feature/message-formatting
   ```

2. **Make changes and test**
   ```bash
   npm test
   npm run check
   ```

3. **Commit with meaningful message**
   ```bash
   git commit -m "feat: improve message formatting"
   ```

4. **Create pull request**
   - Request code review
   - Run CI/CD tests
   - Merge when approved

5. **Deploy to production**
   - Tag release: `git tag v1.0.0`
   - Push to main: `git push origin main`
   - Deploy via CI/CD pipeline

### Code Review Checklist

- [ ] Code follows project style
- [ ] Tests are comprehensive
- [ ] No security vulnerabilities
- [ ] Documentation is updated
- [ ] No hardcoded secrets
- [ ] Performance is acceptable
- [ ] Error handling is proper
- [ ] Comments explain complex logic

### Documentation Best Practices

- Keep README up to date
- Document all environment variables
- Add JSDoc comments to functions
- Include examples in documentation
- Update CHANGELOG for each release
- Maintain API documentation

### Testing Best Practices

- Write tests before code (TDD)
- Aim for 80%+ code coverage
- Test both happy and error paths
- Use descriptive test names
- Mock external dependencies
- Test edge cases

---

## Rollback Procedure

If deployment fails:

```bash
# 1. Identify issue
tail -f logs/error.log

# 2. Stop current version
pm2 stop nova-void-mdx

# 3. Revert to previous commit
git log --oneline
git checkout previous_commit_hash

# 4. Reinstall dependencies if needed
npm install

# 5. Restart application
pm2 start ecosystem.config.js

# 6. Verify
curl http://localhost:3000/health

# 7. Create issue for investigation
# Document what went wrong and how to prevent it
```

---

## Support & Escalation

### Level 1 - Basic Troubleshooting
- Check logs
- Verify configuration
- Restart application
- Check network connectivity

### Level 2 - Advanced Diagnostics
- Profile application
- Analyze memory dumps
- Review git history
- Check system resources

### Level 3 - Critical Issues
- Contact development team
- Prepare detailed logs
- Document reproduction steps
- Have rollback plan ready

---

## Additional Resources

- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Security Checklist](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)
- [Performance Optimization](https://nodejs.org/en/docs/guides/simple-profiling/)

---

**Last Updated:** 2026-09-01
**Version:** 1.0.0
**Status:** Production Ready ✅
