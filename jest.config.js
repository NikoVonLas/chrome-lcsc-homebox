module.exports = {
  testEnvironment: 'node',
  setupFiles: ['jest-webextension-mock'],
  coverageReporters: ['lcov', 'text'],
  collectCoverageFrom: ['src/background.js', 'src/content.js'],
  forceExit: true,
};
