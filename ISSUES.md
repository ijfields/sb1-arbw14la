# Known Issues

## Critical Issues

### WebContainer Tab Issue
- **Description**: Unable to view the project in its own tab after adding the proxy server
- **Related Issue**: [WebContainer Core #1087](https://github.com/stackblitz/webcontainer-core/issues/1087)
- **Impact**: Development/Testing only
- **Status**: Waiting for WebContainer fix
- **Workaround**: Continue using the embedded preview

### DeepSeek Integration Issues
- **Description**: DeepSeek API integration is unstable and failing tests
- **Impact**: Non-critical (not part of MVP)
- **Root Cause**: Authentication and response format inconsistencies
- **Status**: Deferred
- **Resolution Plan**: 
  1. Continue with Latimer and Perplexity for MVP
  2. Revisit DeepSeek integration in future sprints
  3. Consider as optional provider for cost-sensitive deployments

### UI/UX Issues

#### Scroll Position Reset
- **Description**: Page scrolling resets when searching for orders
- **Impact**: Development/Testing only
- **Root Cause**: React state updates triggering full re-renders
- **Status**: To be addressed
- **Potential Solutions**:
  1. Implement scroll position preservation
  2. Use virtualized list for order rendering
  3. Add scroll restoration on state updates

## Development Notes

These issues are primarily affecting development and testing in the WebContainer environment. They are not expected to impact the production deployment for the following reasons:

1. The WebContainer tab issue is specific to the StackBlitz development environment
2. Scroll position reset is likely due to development-specific rendering behavior
3. DeepSeek integration is not required for core functionality

## Future Improvements

### Scroll Handling
- Implement `react-window` or `react-virtualized` for efficient list rendering
- Add scroll position management
- Optimize re-render behavior for search updates

### Performance Optimizations
- Add debouncing for search input
- Implement pagination caching
- Optimize component re-rendering

### AI Provider Integration
- Improve error handling for AI provider responses
- Add fallback mechanisms between providers
- Consider adding more providers for redundancy
- Re-evaluate DeepSeek integration when stability improves

## Monitoring

- Track scroll position reset frequency
- Monitor search performance impact
- Gather user feedback on UI responsiveness
- Monitor AI provider response times and reliability

## Next Steps

1. Monitor WebContainer issue for updates
2. Implement scroll position preservation as a priority fix
3. Consider adding virtualization for large lists
4. Test scroll behavior in production environment
5. Focus on stabilizing Latimer and Perplexity integrations