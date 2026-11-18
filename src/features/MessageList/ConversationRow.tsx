'use client';

import { ContextMenuTrigger, Flexbox, Spin } from '@lobehub/ui';
import * as stylex from '@stylexjs/stylex';
import { type ComponentProps, memo, type MouseEvent, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink, { type WorkspaceLinkProps } from '@/features/Workspace/WorkspaceLink';

import { formatConversationTime, isPlainClick } from './conversations';
import { styles } from './style';

export interface ConversationRowProps {
  active?: boolean;
  activeAt?: Date;
  avatar: ReactNode;
  /**
   * Clicking the open conversation again closes it, back to the Messages home with no row
   * selected. Off for directory lists, whose rows open a profile rather than a conversation.
   */
  closeOnReselect?: boolean;
  contextMenuItems?: ComponentProps<typeof ContextMenuTrigger>['items'];
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onMouseEnter?: () => void;
  preview?: string;
  /** The row element, e.g. the anchor for an inline rename popover. */
  ref?: Ref<HTMLElement>;
  running?: boolean;
  /** Title only, no preview line — for directory lists like the contacts tab. */
  singleLine?: boolean;
  title: string;
  unread?: number;
  url: string;
  /** `tile` draws the pinned large-avatar card; `row` is the regular conversation list line. */
  variant?: 'row' | 'tile';
}

/** A row link that leaves the conversation when it is already open. Modified clicks keep the link. */
const CloseOnReselectLink = ({
  active,
  onClick,
  ...rest
}: WorkspaceLinkProps & { active?: boolean }) => {
  const navigate = useWorkspaceAwareNavigate();
  return (
    <WorkspaceLink
      {...rest}
      onClick={(event) => {
        if (active && isPlainClick(event)) {
          event.preventDefault();
          navigate('/');
          return;
        }
        onClick?.(event);
      }}
    />
  );
};

const ConversationRow = memo<ConversationRowProps>(
  ({
    active,
    closeOnReselect,
    activeAt,
    avatar,
    contextMenuItems,
    onClick,
    onMouseEnter,
    preview,
    ref,
    running,
    singleLine,
    title,
    unread,
    url,
    variant = 'row',
  }) => {
    const isTile = variant === 'tile';
    const { t } = useTranslation('common');
    const link: WorkspaceLinkProps = {
      'aria-current': active ? 'page' : undefined,
      'aria-label': title,
      ref,
      ...stylex.props(
        isTile ? styles.tile : styles.row,
        active && (isTile ? styles.tileActive : styles.rowActive),
      ),
      'to': url,
      onClick,
      onMouseEnter,
    };

    const avatarNode = (
      <span {...stylex.props(styles.avatar)}>
        {avatar}
        {!!unread && unread > 0 && (
          <span {...stylex.props(styles.unread)}>{unread > 99 ? '99+' : unread}</span>
        )}
      </span>
    );

    const content = isTile ? (
      <>
        {avatarNode}
        <span {...stylex.props(styles.tileTitle, active && styles.tileTitleActive)}>{title}</span>
      </>
    ) : (
      <>
        {avatarNode}
        <Flexbox
          flex={1}
          gap={2}
          justify={'center'}
          {...stylex.props(styles.rowText, singleLine && styles.rowTextSingleLine)}
        >
          <Flexbox horizontal align={'center'} gap={8}>
            <span {...stylex.props(styles.title)}>{title}</span>
            {activeAt && (
              <span {...stylex.props(styles.time)}>{formatConversationTime(activeAt)}</span>
            )}
          </Flexbox>
          {/* No preview: the title sits centered at the full row height, not over a blank line. */}
          {!singleLine && (running || preview) && (
            <Flexbox horizontal align={'center'} gap={8}>
              {running ? (
                <Flexbox
                  horizontal
                  align={'center'}
                  {...stylex.props(styles.preview, styles.running)}
                  gap={4}
                >
                  <Spin size={10} style={{ color: 'inherit' }} />
                  {t('messageList.running')}
                </Flexbox>
              ) : (
                <span {...stylex.props(styles.preview)}>{preview}</span>
              )}
            </Flexbox>
          )}
        </Flexbox>
      </>
    );
    const row = closeOnReselect ? (
      <CloseOnReselectLink {...link} active={active}>
        {content}
      </CloseOnReselectLink>
    ) : (
      <WorkspaceLink {...link}>{content}</WorkspaceLink>
    );

    return contextMenuItems ? (
      <ContextMenuTrigger items={contextMenuItems}>{row}</ContextMenuTrigger>
    ) : (
      row
    );
  },
);

ConversationRow.displayName = 'ConversationRow';

export default ConversationRow;
