import { Composition } from "remotion";
import { LinyaAd } from "./LinyaAd";
import { DURATION_SECONDS, FPS, HEIGHT, toFrames, WIDTH } from "./timing";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LinyaAd"
      component={LinyaAd}
      durationInFrames={toFrames(DURATION_SECONDS, FPS)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
