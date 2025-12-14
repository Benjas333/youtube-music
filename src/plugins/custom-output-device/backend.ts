import { type BrowserWindow, dialog } from 'electron';

import { createBackend } from '@/utils';
import { t } from '@/i18n';

export const backend = createBackend<{
  window?: BrowserWindow;
  errorPopUp: (error: Error) => void;
}>({
  start({ ipc, window }) {
    this.window = window;
    ipc.handle('cod-error', this.errorPopUp);
  },

  errorPopUp(error) {
    const formattedError = `${error.name}\n${error.message}\n${error.cause as string}\n${error.stack}`;

    dialog.showMessageBox(this.window!, {
      type: 'error',
      buttons: [
        t('plugins.custom-output-device.backend.dialog.error.buttons.ok'),
      ],
      title: t('plugins.custom-output-device.backend.dialog.error.title'),
      message: t('plugins.custom-output-device.backend.dialog.error.message'),
      detail: formattedError,
    });
  },
});
