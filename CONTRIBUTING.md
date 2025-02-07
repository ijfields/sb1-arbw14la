# Contributing Guidelines

## Development Process

1. **Issue First**
   - Create an issue for bugs or features
   - Get approval before starting work

2. **Branch Strategy**
   - `main`: Production-ready code
   - `develop`: Development branch
   - Feature branches: `feature/issue-number-description`
   - Bug fixes: `fix/issue-number-description`

3. **Commit Convention**
   ```
   type(scope): description

   [optional body]
   [optional footer]
   ```
   Types:
   - feat: New feature
   - fix: Bug fix
   - refactor: Code change that neither fixes a bug nor adds a feature
   - test: Adding missing tests
   - docs: Documentation only changes
   - chore: Changes to the build process or auxiliary tools

4. **Pull Request Process**
   - Reference the issue number
   - Update documentation
   - Add tests if needed
   - Get code review approval

5. **Testing**
   - Run all tests before submitting PR
   - Include new tests for new features
   - Ensure no token usage in tests

6. **Token Usage Guidelines**
   - Log all token usage
   - Use development mode for testing
   - Monitor costs in production

## Version Control

1. **Semantic Versioning**
   - MAJOR: Breaking changes
   - MINOR: New features (non-breaking)
   - PATCH: Bug fixes

2. **Changelog Updates**
   - Keep CHANGELOG.md updated
   - Follow Keep a Changelog format