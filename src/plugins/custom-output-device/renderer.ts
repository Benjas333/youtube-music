import { dev } from 'electron-is';

import { createRenderer } from '@/utils';

import type { YoutubePlayer } from '@/types/youtube-player';
import type { RendererContext } from '@/types/contexts';
import type { CustomOutputPluginConfig } from './index';

const pluginLoggingPrefix = '[Custom Output Device Plugin]';

const updateDeviceList = async (
  context: RendererContext<CustomOutputPluginConfig>,
) => {
  if (dev()) console.debug(pluginLoggingPrefix, 'Reloading devices...');
  const newDevices: Record<string, string> = {};
  const devices = await navigator.mediaDevices.enumerateDevices();
  for (const device of devices) {
    if (device.kind !== 'audiooutput') continue;

    newDevices[device.deviceId] = device.label;
  }
  if (dev()) console.debug(pluginLoggingPrefix, 'New devices:', newDevices);
  const options = await context.getConfig();
  options.devices = newDevices;
  context.setConfig(options);
};

const updateSinkId = async (audioContext?: AudioContext, sinkId?: string) => {
  if (!audioContext || !sinkId) {
    if (dev()) console.error('No audioContext or sinkId');
    return;
  }
  if (!('setSinkId' in audioContext)) {
    if (dev()) console.error('setSinkId not in audioContext');
    return;
  }
  if (typeof audioContext.setSinkId !== 'function') {
    if (dev()) console.error('setSinkId is not a function (? wtf');
    return;
  }

  if (dev())
    console.debug(
      pluginLoggingPrefix,
      `Updating sinkId to: ${sinkId}`,
      audioContext,
    );
  // await audioContext.setSinkId(sinkId);
  try {
    await (audioContext.setSinkId as () => Promise<void>)();
  } catch (error) {
    console.error(
      pluginLoggingPrefix,
      'setSinkId threw an error when called:',
      error,
    );
  }
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
    if (dev())
      console.debug(
        pluginLoggingPrefix,
        'New audioContext and/or audioSource:',
        audioContext,
        audioSource,
      );
    this.audioContext = audioContext;
    await updateSinkId(audioContext, this.options!.output);
  },

  async onPlayerApiReady(_: YoutubePlayer, context) {
    if (dev()) console.debug(pluginLoggingPrefix, 'Plugin enabled');
    this.options = await context.getConfig();
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
    if (dev()) console.debug(pluginLoggingPrefix, 'Plugin disabled');
    document.removeEventListener(
      'ytmd:audio-can-play',
      this.audioCanPlayHandler,
    );
    navigator.mediaDevices.ondevicechange = null;
  },

  async onConfigChange(config) {
    if (dev()) console.debug(pluginLoggingPrefix, 'Config changed:', config);
    this.options = config;
    await updateSinkId(this.audioContext, config.output);
  },
});
