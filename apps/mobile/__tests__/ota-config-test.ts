import appJson from '../app.json';
import easJson from '../eas.json';
import packageJson from '../package.json';

describe('OTA configuration', () => {
  it('enables EAS Update for the current app runtime', () => {
    expect(appJson.expo.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(appJson.expo.updates).toMatchObject({
      checkAutomatically: 'ON_LOAD',
      url: `https://u.expo.dev/${appJson.expo.extra.eas.projectId}`,
    });
    expect(packageJson.dependencies['expo-updates']).toMatch(/^~57\./);
  });

  it('uses separate update channels for layout previews and production', () => {
    expect(easJson.build['layout-preview']).toMatchObject({
      channel: 'layout-preview',
      distribution: 'internal',
      extends: 'production',
      ios: { distribution: 'internal' },
    });
    expect(easJson.build.production.channel).toBe('production');
    expect(easJson.build.preview.channel).toBe('preview');
    expect(easJson.build['testflight-layout']).toMatchObject({
      channel: 'layout-preview',
      distribution: 'store',
      extends: 'production',
      autoIncrement: true,
      ios: { distribution: 'store' },
    });
    expect(easJson.cli.version).toBe(packageJson.devDependencies['eas-cli']);
    expect(packageJson.scripts['update:layout-preview']).toContain('--channel layout-preview');
    expect(packageJson.scripts['update:layout-preview']).toContain('--environment production');
  });

  it('allows the native window to use portrait and landscape layouts', () => {
    expect(appJson.expo.orientation).toBe('default');
    expect(appJson.expo.ios.supportsTablet).toBe(true);
  });
});
