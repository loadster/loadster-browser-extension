import { allowWindowMessaging } from 'webext-bridge/content-script';
import { RECORDER_NAMESPACE } from './constants.js';

console.log('client-tab-content.js');

allowWindowMessaging(RECORDER_NAMESPACE);
