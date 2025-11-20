# Environment Configuration

This project uses environment variables to manage configuration across different deployment environments.

## Environment Files

- `.env.development` - Development environment (localhost)
- `.env.production` - Production environment template
- `.env.example` - Example file showing all available variables
- `.env.local` - Local overrides (not tracked in git)

## Available Variables

### `VITE_API_URL`
The base URL for the backend API.

- **Development**: `http://localhost:3001/api/v1`
- **Production**: `https://api.yourdomain.com/api/v1`
- **Staging**: `https://api-staging.yourdomain.com/api/v1`

### `VITE_APP_ENV`
The current environment name (for debugging/logging).

## Usage

### Development
The `.env.development` file is automatically loaded when running `npm run dev`.

### Production
Set environment variables in your deployment platform:
- **AWS**: Use Systems Manager Parameter Store or environment variables in ECS/Lambda
- **Vercel**: Set in project settings
- **Netlify**: Set in site settings
- **Docker**: Pass via `-e` flag or docker-compose

### Local Overrides
Create `.env.local` to override any environment variable locally:
```bash
# .env.local
VITE_API_URL=http://localhost:8080/api/v1
```

## Deployment Examples

### AWS CloudFormation
```yaml
Environment:
  Variables:
    VITE_API_URL: !Sub "https://${ApiDomain}/api/v1"
```

### Docker
```bash
docker run -e VITE_API_URL=https://api.yourdomain.com/api/v1 your-app
```

### Vercel
```bash
vercel env add VITE_API_URL production
```

## Security Notes

- Only variables prefixed with `VITE_` are exposed to the frontend
- Never put secrets in frontend environment variables
- API URLs are public - use authentication for security