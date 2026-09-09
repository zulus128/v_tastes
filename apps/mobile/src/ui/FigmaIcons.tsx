import type { ComponentType } from 'react';
import { View } from 'react-native';
import { responsiveSize, responsiveStyleSheet } from './responsive';
import type { SvgProps } from 'react-native-svg';
import CreateVector from '../../assets/figma-icons/create.svg';
import DialogOutlineDetail from '../../assets/figma-icons/dialog-outline-detail.svg';
import DialogOutlineMain from '../../assets/figma-icons/dialog-outline-main.svg';
import DiscoverOutline from '../../assets/figma-icons/discover-outline.svg';
import HomeBold from '../../assets/figma-icons/home-bold.svg';
import Logo from '../../assets/figma-icons/logo-exact.svg';
import Notifications from '../../assets/figma-icons/notifications.svg';
import ProfileOutline from '../../assets/figma-icons/profile-outline.svg';
import Stats from '../../assets/figma-icons/stats.svg';
import { useAppTheme } from './ThemeProvider';

type TabGlyphName = 'Home' | 'Discover' | 'Dialog' | 'Profile';
type Vector = ComponentType<SvgProps>;

function Layer({
  component: Component,
  color,
  height,
  style,
  width,
}: {
  component: Vector;
  color: string;
  height: number;
  style: object;
  width: number;
}) {
  return (
    <Component
      color={color}
      height={responsiveSize(height)}
      style={[styles.layer, style]}
      width={responsiveSize(width)}
    />
  );
}

// Each tab keeps a single glyph in both states — filled feed for Home,
// outlines for the rest; focus only switches the tint between text and muted.
export function TabBarGlyph({ active, name }: { active: boolean; name: TabGlyphName }) {
  const { colors } = useAppTheme();
  const color = active ? colors.text : colors.textMuted;
  if (name === 'Home') {
    return (
      <View style={styles.icon}>
        <Layer color={color} component={HomeBold} height={16.6667} style={styles.homeBold} width={15} />
      </View>
    );
  }

  if (name === 'Discover') {
    return (
      <View style={styles.icon}>
        <Layer color={color} component={DiscoverOutline} height={17.9169} style={styles.discoverOutline} width={14.5833} />
      </View>
    );
  }

  if (name === 'Dialog') {
    return (
      <View style={styles.icon}>
        <Layer color={color} component={DialogOutlineMain} height={17.9951} style={styles.dialogOutlineMain} width={17.9554} />
        <Layer color={color} component={DialogOutlineDetail} height={1.6667} style={styles.dialogOutlineDetail} width={7.5} />
      </View>
    );
  }

  return (
    <View style={styles.icon}>
      <Layer color={color} component={ProfileOutline} height={17.9167} style={styles.profileOutline} width={14.5834} />
    </View>
  );
}

export function CreateTabGlyph() {
  return (
    <View style={styles.createIcon}>
      <Layer color="#FFFFFF" component={CreateVector} height={14} style={styles.createVector} width={14} />
    </View>
  );
}

export function StatsGlyph() {
  const { colors } = useAppTheme();
  return <Stats color={colors.text} width={responsiveSize(24)} height={responsiveSize(24)} />;
}

export function NotificationsGlyph() {
  const { colors } = useAppTheme();
  return (
    <View style={styles.headerIcon}>
      <Layer color={colors.text} component={Notifications} height={17.9167} style={styles.notifications} width={16.8076} />
    </View>
  );
}

export function TastesLogo({ width = 72 }: { width?: number } = {}) {
  const { colors } = useAppTheme();
  return <Logo color={colors.text} width={width} height={width * (36.1319 / 72)} />;
}

const styles = responsiveStyleSheet({
  layer: { position: 'absolute' },
  icon: { width: 20, height: 20 },
  headerIcon: { width: 24, height: 24 },
  createIcon: { width: 24, height: 24 },
  homeBold: { top: '8.33%', left: '12.5%' },
  discoverOutline: { top: '5.21%', left: '13.54%' },
  dialogOutlineMain: { top: '4.82%', left: '5.21%' },
  dialogOutlineDetail: { top: '54.17%', left: '22.92%' },
  profileOutline: { top: '5.21%', left: '13.54%' },
  createVector: { top: 5, left: 5 },
  notifications: { top: '5.21%', left: '7.98%' },
});
