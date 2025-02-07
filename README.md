# Executive Policy Tracker

## Version: 0.2.1

A comprehensive tool for tracking and analyzing executive orders and their impact on policy proposals.

## Features

- Executive order tracking and synchronization
- AI-powered policy analysis
- Document comparison and impact assessment
- Real-time updates and notifications
- PDF document processing

## AI Provider Status

- ✅ Perplexity API: Fully operational with chunking support for large documents
- ⚠️ Latimer API: Limited to text-only assessments (file processing not supported)
- ⏸️ DeepSeek API: Temporarily disabled (see [ISSUES.md](./ISSUES.md))

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Development

### Version Control

We follow semantic versioning (MAJOR.MINOR.PATCH):
- MAJOR: Breaking changes
- MINOR: New features, backward compatible
- PATCH: Bug fixes, backward compatible

### Branch Strategy

- `main`: Production-ready code
- `develop`: Development branch
- `feature/*`: New features
- `fix/*`: Bug fixes
- `release/*`: Release preparation

### Commit Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Testing
- `chore`: Maintenance

Example:
```
feat(ai): add Perplexity API chunking support
```

### Release Process

1. Create release branch:
   ```bash
   git checkout -b release/v1.0.0
   ```
2. Update version in package.json
3. Update CHANGELOG.md
4. Create pull request to main
5. Tag release after merge:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

## Testing

Run tests:
```bash
npm test
```

Run with coverage:
```bash
npm run test:coverage
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Create pull request

## License

MIT License - see LICENSE file for details