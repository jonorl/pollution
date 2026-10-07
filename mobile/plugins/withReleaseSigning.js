const { withAppBuildGradle } = require('expo/config-plugins');

// Release builds are signed with the upload key whenever Gradle is given its four properties: CI
// passes them as ORG_GRADLE_PROJECT_* environment variables, and locally they can live in
// ~/.gradle/gradle.properties. Without them a release build falls back to the debug key, which is
// fine for trying one out but can't update a copy installed from a GitHub release.
const PROPERTY = 'POLLUTION_UPLOAD_STORE_FILE';

const RELEASE_CONFIG = `        release {
            if (project.hasProperty('${PROPERTY}')) {
                storeFile file(${PROPERTY})
                storePassword POLLUTION_UPLOAD_STORE_PASSWORD
                keyAlias POLLUTION_UPLOAD_KEY_ALIAS
                keyPassword POLLUTION_UPLOAD_KEY_PASSWORD
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes(PROPERTY)) return config;

    // The release build type, which Expo's template points at the debug key.
    const releaseType = /(release \{[^}]*?)signingConfig signingConfigs\.debug/;
    const signingConfigs = /signingConfigs \{\n/;
    if (!releaseType.test(gradle) || !signingConfigs.test(gradle)) {
      // Better to stop the build than to ship a release signed with the wrong key.
      throw new Error('withReleaseSigning: android/app/build.gradle no longer has the signing blocks it expects');
    }
    gradle = gradle.replace(
      releaseType,
      `$1signingConfig (project.hasProperty('${PROPERTY}') ? signingConfigs.release : signingConfigs.debug)`,
    );
    gradle = gradle.replace(signingConfigs, (match) => match + RELEASE_CONFIG);
    config.modResults.contents = gradle;
    return config;
  });
};
