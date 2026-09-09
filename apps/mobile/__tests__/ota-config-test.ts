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

  it('keeps layout previews isolated from production updates', () => {
    expect(easJson.build['testflight-layout']).toMatchObject({
      channel: 'layout-preview',
      extends: 'production',
    });
    expect(easJson.build.production.channel).toBe('production');
    expect(easJson.build.preview.channel).toBe('preview');
    expect(packageJson.scripts['update:layout-preview']).toContain('pnpm dlx eas-cli@23.2.0');
  });

  it('allows the native window to use portrait and landscape layouts', () => {
    expect(appJson.expo.orientation).toBe('default');
    expect(appJson.expo.ios.supportsTablet).toBe(true);
  });
});
