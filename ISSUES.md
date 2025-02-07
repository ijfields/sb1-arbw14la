# Known Issues

## Critical Issues

### AI Provider Integration
- **Latimer API File Processing**
  - **Description**: Latimer API cannot process large policy documents
  - **Impact**: File-based assessments failing with "request entity too large" error
  - **Status**: Active issue
  - **Workaround**: Using Perplexity API with chunking for large documents

### Assessment Engine
- [ ] Token usage monitoring implementation
- [ ] Rate limiting for API calls
- [ ] Error recovery for failed assessments
- [ ] Performance optimization for large documents

### UI/UX
- [ ] Policy selection dropdown validation
- [ ] Assessment result display improvements
- [ ] Loading state indicators
- [ ] Error message clarity

### Testing
- [ ] Development mode test coverage
- [ ] Production mode integration tests
- [ ] Token usage validation tests
- [ ] Performance benchmarks

## High Priority

### Token Management
- [ ] Usage tracking implementation
- [ ] Cost monitoring system
- [ ] Usage optimization strategies
- [ ] Alert system for overages

### Documentation
- [ ] API integration guides
- [ ] Token usage guidelines
- [ ] Testing procedures
- [ ] Contribution guidelines

## Medium Priority

### Feature Enhancements
- [ ] Batch assessment processing
- [ ] Export functionality
- [ ] Historical data analysis
- [ ] Custom policy support

### Performance
- [ ] Caching implementation
- [ ] Database query optimization
- [ ] Frontend rendering improvements
- [ ] API response time optimization

## Low Priority

### Future Features
- [ ] Advanced analytics
- [ ] Custom reporting
- [ ] Integration expansions
- [ ] UI theme customization

## Notes

### Issue Management
1. Create detailed issues from these templates
2. Prioritize based on impact and dependencies
3. Track progress in project board
4. Regular status updates

### Version Control
1. Follow semantic versioning
2. Update CHANGELOG.md
3. Document breaking changes
4. Track API versions

### AI Provider Status
- ✅ Perplexity API: Fully operational with chunking support
- ⚠️ Latimer API: Limited to text-only assessments (file processing not supported)
- ⏸️ DeepSeek API: Temporarily disabled