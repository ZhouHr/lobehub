import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';

export const AVATAR_SIZE = 28;
/** Pinned tiles use a card-sized avatar over the compact row one. */
export const PINNED_AVATAR_SIZE = 56;

export const styles = stylex.create({
  avatar: {
    position: 'relative',
    display: 'inline-flex',
    flex: 'none',
  },
  empty: {
    paddingBlock: '8px',
    paddingInline: '10px',
    fontSize: '12px',
    color: cssVar.colorTextQuaternary,
  },
  /** Pinned conversations read as a card grid, like OpenBot's pinned assistants. */
  pinnedGroup: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
    columnGap: '4px',
    rowGap: '2px',
  },
  preview: {
    overflow: 'hidden',
    minWidth: 0,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: '1',
    fontSize: '12px',
    lineHeight: '16px',
    color: cssVar.colorTextTertiary,
  },
  row: {
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    paddingBlock: '8px',
    paddingInline: '8px',
    borderRadius: cssVar.borderRadiusLG,
    color: { 'default': cssVar.colorText, ':hover': cssVar.colorText },
    textDecoration: 'none',
    backgroundColor: { 'default': null, ':hover': cssVar.colorFillTertiary },
    transition: 'background-color 0.15s',
  },
  rowActive: {
    backgroundColor: { 'default': cssVar.colorFillSecondary, ':hover': cssVar.colorFillSecondary },
  },
  /** Title plus preview line, so a row without a preview keeps the same height. */
  rowText: {
    minWidth: 0,
    minHeight: '36px',
  },
  rowTextSingleLine: {
    minHeight: 0,
  },
  running: {
    color: cssVar.colorSuccess,
  },
  /** A pinned conversation as a large-avatar tile instead of a row. */
  tile: {
    cursor: 'pointer',
    userSelect: 'none',

    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    alignItems: 'center',

    paddingBlockStart: '8px',
    paddingBlockEnd: '6px',
    paddingInline: '4px',
    borderRadius: cssVar.borderRadiusLG,

    color: cssVar.colorText,
    textDecoration: 'none',

    backgroundColor: { default: null, ':hover': cssVar.colorFillTertiary },
    transition: 'background-color 0.15s',
  },
  tileActive: {
    backgroundColor: { default: cssVar.colorFillSecondary, ':hover': cssVar.colorFillSecondary },
  },
  tileTitle: {
    overflow: 'hidden',
    width: '100%',

    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '16px',
    color: cssVar.colorTextSecondary,
    textAlign: 'center',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tileTitleActive: {
    color: cssVar.colorText,
    fontWeight: 600,
  },
  time: {
    flex: 'none',
    fontSize: '11px',
    lineHeight: '18px',
    color: cssVar.colorTextQuaternary,
  },
  title: {
    overflow: 'hidden',
    minWidth: 0,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: '1',
    fontSize: '13px',
    fontWeight: 500,
    lineHeight: '18px',
  },
  unread: {
    pointerEvents: 'none',
    position: 'absolute',
    insetBlockStart: '-5px',
    insetInlineEnd: '-6px',
    minWidth: '16px',
    height: '16px',
    paddingInline: '4px',
    borderWidth: '1.5px',
    borderStyle: 'solid',
    borderColor: cssVar.colorBgContainer,
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: '13px',
    color: '#fff',
    textAlign: 'center',
    backgroundColor: cssVar.colorError,
  },
});
