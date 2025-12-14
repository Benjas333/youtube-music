// import { dev } from 'electron-is';

import { createRenderer } from '@/utils';

import { t } from '@/i18n';

import type { YoutubePlayer } from '@/types/youtube-player';
import type { RendererContext } from '@/types/contexts';
import type { CustomOutputPluginConfig } from './index';

const pluginLogsPrefix = '[Custom Output Device Plugin]';
const incompatibilityWarning = t(
  'plugins.custom-output-device.incompatibility-warning',
);
let cachedIpc: {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
};
const dev = () => true;

const devLog = (message: any, ...args: any[]) => {
  if (!dev()) return;

  console.debug(pluginLogsPrefix, message, ...args);
};

const errorLog = (error: Error) => {
  console.error(pluginLogsPrefix, error);

  cachedIpc.invoke('cod-error', error);
};

const updateDeviceList = async (
  context: RendererContext<CustomOutputPluginConfig>,
) => {
  devLog('Reloading devices...');
  const newDevices: Record<string, string> = {};
  const devices = await navigator.mediaDevices.enumerateDevices();
  for (const device of devices) {
    if (device.kind !== 'audiooutput') continue;

    newDevices[device.deviceId] = device.label;
  }
  devLog('New devices:', newDevices);
  const options = await context.getConfig();
  options.devices = newDevices;
  context.setConfig(options);
};

const updateSinkId = async (
  audioContext?: AudioContext & {
    setSinkId?: (sinkId: string) => Promise<void>;
  },
  sinkId?: string,
) => {
  if (!audioContext || !sinkId) {
    errorLog(Error('No audioContext or sinkId'));
    return;
  }
  if (!('setSinkId' in audioContext)) {
    errorLog(
      Error(`setSinkId is not in audioContext\n${incompatibilityWarning}`),
    );
    return;
  }
  if (typeof audioContext.setSinkId !== 'function') {
    errorLog(
      Error(
        `setSinkId is not a function. Current type: ${typeof audioContext.setSinkId}\n${incompatibilityWarning}`,
      ),
    );
    return;
  }

  devLog('Updating sinkId to:', sinkId, audioContext);
  try {
    await audioContext.setSinkId(sinkId);
  } catch (error) {
    const err = error as Error;
    err.message += `\n${incompatibilityWarning}`;
    errorLog(err);
  }

  // const video = document.querySelector('video')!;
  // try {
  //   await video.setSinkId(sinkId);
  // } catch (error) {
  //   const err = error as Error;
  //   err.message += `\n${incompatibilityWarning}`;
  //   errorLog(err);
  // }
};

export const renderer = createRenderer<
  {
    options?: CustomOutputPluginConfig;
    audioContext?: AudioContext;
    audioCanPlayHandler: (event: CustomEvent<Compressor>) => Promise<void>;
  },
  CustomOutputPluginConfig
>({
  async audioCanPlayHandler({ detail: { audioContext, audioSource } }) {
    devLog('New audioContext and/or audioSource:', audioContext, audioSource);
    this.audioContext = audioContext;
    await updateSinkId(audioContext, this.options!.output);
  },

  async onPlayerApiReady(_: YoutubePlayer, context) {
    devLog('Plugin enabled');
    cachedIpc = context.ipc;
    this.options = await context.getConfig();
    devLog('Initial config:', this.options);
    await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    navigator.mediaDevices.ondevicechange = async () =>
      await updateDeviceList(context);

    document.addEventListener('ytmd:audio-can-play', this.audioCanPlayHandler, {
      once: true,
      passive: true,
    });
    await updateDeviceList(context);
  },

  stop() {
    devLog('Plugin disabled');
    document.removeEventListener(
      'ytmd:audio-can-play',
      this.audioCanPlayHandler,
    );
    navigator.mediaDevices.ondevicechange = null;
  },

  async onConfigChange(config) {
    devLog('Config changed:', config);
    this.options = config;
    await updateSinkId(this.audioContext, config.output);
  },
});
