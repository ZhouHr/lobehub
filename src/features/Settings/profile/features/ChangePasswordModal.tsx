'use client';

import {
  Button,
  createModal,
  Flexbox,
  InputPassword,
  type ModalInstance,
  toast,
  useModalContext,
} from '@lobehub/ui';
import { t } from 'i18next';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { changePassword } from '@/libs/better-auth/auth-client';

const ChangePasswordContent = memo(() => {
  const { t } = useTranslation('auth');
  const { close } = useModalContext();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (newPassword.length < 8) {
      toast.error(t('profile.passwordTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('profile.passwordMismatch'));
      return;
    }

    try {
      setLoading(true);
      const { error } = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });

      if (error) {
        toast.error(error.message || t('profile.passwordChangeError'));
        return;
      }

      toast.success(t('profile.passwordChangeSuccess'));
      close();
    } catch (error) {
      console.error('Failed to change password:', error);
      toast.error(t('profile.passwordChangeError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flexbox gap={12} paddingBlock={8}>
      <InputPassword
        autoComplete={'current-password'}
        placeholder={t('profile.currentPassword')}
        value={currentPassword}
        variant={'filled'}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <InputPassword
        autoComplete={'new-password'}
        placeholder={t('profile.newPassword')}
        value={newPassword}
        variant={'filled'}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      <InputPassword
        autoComplete={'new-password'}
        placeholder={t('profile.confirmPassword')}
        value={confirmPassword}
        variant={'filled'}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />
      <Flexbox horizontal gap={8} justify={'flex-end'}>
        <Button disabled={loading} onClick={close}>
          {t('profile.cancel')}
        </Button>
        <Button loading={loading} type={'primary'} onClick={submit}>
          {t('profile.save')}
        </Button>
      </Flexbox>
    </Flexbox>
  );
});

ChangePasswordContent.displayName = 'ChangePasswordContent';

export const createChangePasswordModal = (): ModalInstance =>
  createModal({
    content: <ChangePasswordContent />,
    footer: null,
    maskClosable: true,
    styles: {
      content: { paddingBlock: 16, paddingInline: 24 },
    },
    title: t('profile.changePasswordTitle', { ns: 'auth' }),
    width: 'min(90vw, 420px)',
  });
