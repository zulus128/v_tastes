/* eslint-disable no-undef */
module.exports = {
  native: true,
  // The bold tab glyph exports carry the UI kit's accent red; the rendered
  // tab tint comes from the theme, so route it through the color prop. The
  // recap/leaderboard illustration SVGs keep intentional reds but are only
  // consumed as PNG twins, so this mapping does not reach them.
  replaceAttrValues: {
    '#B82F29': 'currentColor',
  },
};
