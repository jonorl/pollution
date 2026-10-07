import Constants from 'expo-constants';
import { useContext, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { tr } from './i18n';
import { BandColour, colours, fonts, GUTTER } from './theme';

const REPO_URL = 'https://github.com/jonorl/pollution';
const WEB_URL = 'https://jonathan-orlowski.dev/pollution/';
// Product names, so the same in every language.
const STACK = [
  'Rust · ESP-IDF',
  'TypeScript',
  'Fastify',
  'Prisma',
  'PostgreSQL',
  'Docker',
  'Caddy',
  'GitHub Actions',
  'React',
  'Vite',
  'three.js',
  'Cloudflare',
  'React Native',
  'Expo',
];

const hardwarePhoto = require('../assets/hardware.webp');
const PHOTO_ASPECT = 720 / 766;
const SHEET_MAX_WIDTH = 560;
const SHEET_PADDING = 22;

/** The button that opens the project notes, and the sheet it opens. */
export function About() {
  const [open, setOpen] = useState(false);
  const band = useContext(BandColour);
  const screen = useWindowDimensions();
  const text = tr().about;
  const version = Constants.expoConfig?.version;
  const close = () => setOpen(false);
  // Sized outright: given only a width, an image takes its file's height and stretches.
  const photoWidth = Math.min(360, Math.min(screen.width - 2 * GUTTER, SHEET_MAX_WIDTH) - 2 * SHEET_PADDING - 2);

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} hitSlop={6} style={styles.pill}>
        <Text style={styles.pillText}>{text.open}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        <View style={styles.backdrop}>
          {/* Tapping round the sheet closes it, as clicking a dialog's backdrop does on the web. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={text.close} />
          <View style={[styles.sheet, { maxHeight: Math.min(screen.height * 0.86, 760) }]}>
            <ScrollView contentContainerStyle={styles.body}>
              <View style={styles.top}>
                <Text style={styles.heading} accessibilityRole="header">
                  {text.title}
                </Text>
                <Pressable accessibilityRole="button" onPress={close} hitSlop={6} style={styles.pill}>
                  <Text style={styles.pillText}>{text.close}</Text>
                </Pressable>
              </View>
              <Text style={styles.intro}>{text.intro}</Text>
              {text.sections.map((section) => (
                <View key={section.id}>
                  <Text style={styles.term}>{section.heading}</Text>
                  <Text style={styles.detail}>{section.body}</Text>
                  {section.id === 'hardware' && (
                    <Image
                      source={hardwarePhoto}
                      accessibilityLabel={text.photo}
                      style={[styles.photo, { width: photoWidth, height: photoWidth / PHOTO_ASPECT }]}
                    />
                  )}
                </View>
              ))}
              <View>
                <Text style={styles.term}>{text.stack}</Text>
                <View style={styles.stack}>
                  {STACK.map((item) => (
                    <Text key={item} style={styles.stackItem}>
                      {item}
                    </Text>
                  ))}
                </View>
              </View>
              <View style={styles.links}>
                <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(REPO_URL)} hitSlop={6}>
                  <Text style={[styles.link, { color: band }]}>{text.source} ↗</Text>
                </Pressable>
                <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(WEB_URL)} hitSlop={6}>
                  <Text style={[styles.link, { color: band }]}>{text.web} ↗</Text>
                </Pressable>
              </View>
              {version && <Text style={styles.version}>{text.version(version)}</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.88,
    color: colours.muted,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: GUTTER,
    backgroundColor: 'rgba(3, 5, 8, 0.78)',
  },
  sheet: {
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: 16,
    backgroundColor: colours.bg,
    overflow: 'hidden',
  },
  body: {
    gap: 18,
    padding: SHEET_PADDING,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  heading: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 30,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colours.fg,
    includeFontPadding: false,
  },
  intro: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 23,
    color: colours.fg,
  },
  term: {
    marginBottom: 4,
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colours.faint,
  },
  detail: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21.7,
    color: colours.muted,
  },
  photo: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: 10,
  },
  stack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stackItem: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: 999,
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    lineHeight: 13,
    color: colours.fg,
  },
  links: {
    gap: 10,
  },
  link: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
  },
  version: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colours.faint,
  },
});
