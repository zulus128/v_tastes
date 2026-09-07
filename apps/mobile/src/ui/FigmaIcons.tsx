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
  size,
  style,
}: {
  component: Vector;
  color: string;
  size: number;
  style: object;
}) {
  return <Component color={color} height={responsiveSize(size)} style={[styles.layer, style]} width={responsiveSize(size)} />;
}

// Each tab keeps a single glyph in both states — filled feed for Home,
// outlines for the rest; focus only switches the tint between text and muted.
export function TabBarGlyph({ active, name }: { active: boolean; name: TabGlyphName }) {
  const { colors } = useAppTheme();
  const color = active ? colors.text : colors.textMuted;
  if (name === 'Home') {
    return (
      <View style={styles.icon}>
        <Layer color={color} component={HomeBold} size={20} style={styles.homeBold} />
      </View>
    );
  }

  if (name === 'Discover') {
    return (
      <View style={styles.icon}>
        <Layer color={color} component={DiscoverOutline} size={20} style={styles.discoverOutline} />
      </View>
    );
  }

  if (name === 'Dialog') {
    return (
      <View style={styles.icon}>
        <Layer color={color} component={DialogOutlineMain} size={20} style={styles.dialogOutlineMain} />
        <Layer color={color} component={DialogOutlineDetail} size={20} style={styles.dialogOutlineDetail} />
      </View>
    );
  }

  return (
    <View style={styles.icon}>
      <Layer color={color} component={ProfileOutline} size={20} style={styles.profileOutline} />
    </View>
  );
}

export function CreateTabGlyph() {
  return (
    <View style={styles.createIcon}>
      <Layer color="#FFFFFF" component={CreateVector} size={24} style={styles.createVector} />
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
      <Layer color={colors.text} component={Notifications} size={24} style={styles.notifications} />
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
  homeBold: { top: '8.33%', right: '12.5%', bottom: '8.34%', left: '12.5%' },
  discoverOutline: { top: '5.21%', right: '13.54%', bottom: '5.21%', left: '13.54%' },
  dialogOutlineMain: { top: '4.82%', right: '5.02%', bottom: '5.2%', left: '5.21%' },
  dialogOutlineDetail: { top: '54.17%', right: '39.58%', bottom: '37.5%', left: '22.92%' },
  profileOutline: { top: '5.21%', right: '13.54%', bottom: '5.21%', left: '13.54%' },
  createVector: { top: 5, right: 5, bottom: 5, left: 5 },
  notifications: { top: '5.21%', right: '7.98%', bottom: '5.21%', left: '7.98%' },
});
