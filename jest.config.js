module.exports = {
  testEnvironment: 'node',
  setupFiles: ['jest-webextension-mock', './test/setup.js'],
  coverageReporters: ['lcov', 'text'],
  collectCoverageFrom: ['src/background.js', 'src/content.js'],
  forceExit: true,
};
