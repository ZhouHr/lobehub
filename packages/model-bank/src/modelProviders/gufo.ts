import type { ModelProviderCard } from '../types';

/**
 * Gufo provider for the private MiniMax H3 deployment on ai07.
 *
 * gufo serves an OpenAI-compatible asynchronous video API under `/v1/videos`, so this
 * provider reuses the OpenAI-compatible runtime instead of MiniMax's native v2 protocol.
 * The endpoint has no authentication of its own; put a reverse proxy or the ai07 gateway
 * in front of it and use the API key field for the gateway token.
 */
const Gufo: ModelProviderCard = {
  chatModels: [],
  description:
    'Private MiniMax H3 video service on ai07 (AMD Strix Halo), served by gufo through an OpenAI-compatible asynchronous video API.',
  disableBrowserRequest: true,
  enabled: false,
  id: 'gufo',
  modelsUrl: 'http://192.168.197.157:8080/v1/models',
  name: 'Gufo (ai07)',
  settings: {
    disableBrowserRequest: true,
    proxyUrl: {
      desc: 'gufo 视频服务地址，需要包含 /v1',
      placeholder: 'http://192.168.197.157:8080/v1',
    },
    sdkType: 'openai',
    showAddNewModel: false,
    showApiKey: true,
    showChecker: false,
    showModelFetcher: false,
  },
  url: 'https://github.com/gufo-org/gufo',
};

export default Gufo;
