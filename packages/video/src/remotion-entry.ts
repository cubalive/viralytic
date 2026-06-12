// Programmatic Remotion entry point used by @remotion/bundler when the
// video-assembly worker renders. Mirrors what the CLI does for previews.
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
