/**
 * A device that can't hover, like a phone, whose on-screen keyboard covers much of the page and
 * whose Enter is for new lines.
 */
export const touchOnly = () => window.matchMedia?.('(hover: none)').matches === true
