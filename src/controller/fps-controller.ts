import { Events } from '../events';
import { logger } from '../utils/logger';
import type { ComponentAPI } from '../types/component-api';
import type Hls from '../hls';
import type { LevelSwitchedData, MediaAttachingData } from '../types/events';
import StreamController from './stream-controller';

export interface FrameInfoForCertainLevel {
  resolution?: string;
  codec?: string;
  fps?: string;
  decodedFrames: number;
  droppedFrames: number;
}

class FPSController implements ComponentAPI {
  private hls: Hls;
  private isVideoPlaybackQualityAvailable: boolean = false;
  private timer?: number;
  private media: HTMLVideoElement | null = null;
  private lastTime: any;
  private lastDroppedFrames: number = 0;
  private lastDecodedFrames: number = 0;
  // stream controller must be provided as a dependency!
  private streamController!: StreamController;

  constructor(hls: Hls) {
    this.hls = hls;

    this.registerListeners();
  }

  public setStreamController(streamController: StreamController) {
    this.streamController = streamController;
  }

  public getFrameInfoForCurrentLevel(): FrameInfoForCertainLevel | null {
    const attr = this.hls.levels[this.hls.currentLevel]?.attrs;
    if (!attr) {
      return null;
    }
    const videoPlaybackQuality = this.getVideoPlaybackQuality();
    if (!videoPlaybackQuality) {
      return null;
    }
    const { RESOLUTION: resolution, CODECS: codec, 'FRAME-RATE': fps} = attr;
    const { totalVideoFrames, droppedVideoFrames } = videoPlaybackQuality;
    const frameInfo = {
      resolution, 
      codec, 
      fps, 
      decodedFrames: totalVideoFrames - this.lastDecodedFrames,
      droppedFrames: droppedVideoFrames - this.lastDroppedFrames,
    };
    return frameInfo;
  }

  protected registerListeners() {
    this.hls.on(Events.MEDIA_ATTACHING, this.onMediaAttaching, this);
    this.hls.on(Events.LEVEL_SWITCHED, this.onLevelSwitched, this);
  }

  protected unregisterListeners() {
    this.hls.off(Events.LEVEL_SWITCHED, this.onLevelSwitched, this);
    this.hls.off(Events.MEDIA_ATTACHING, this.onMediaAttaching, this);
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.unregisterListeners();
    this.isVideoPlaybackQualityAvailable = false;
    this.media = null;
  }

  protected onMediaAttaching(
    event: Events.MEDIA_ATTACHING,
    data: MediaAttachingData,
  ) {
    const config = this.hls.config;
    const media =
        data.media instanceof self.HTMLVideoElement ? data.media : null;
    this.media = media;
    if (media && typeof media.getVideoPlaybackQuality === 'function') {
      this.isVideoPlaybackQualityAvailable = true;
    }

    self.clearInterval(this.timer);
    this.timer = self.setInterval(
      this.checkFPSInterval.bind(this),
      config.fpsDroppedMonitoringPeriod
    );
  }

  protected onLevelSwitched(
    event: Events.LEVEL_SWITCHED,
    data: LevelSwitchedData,
  ) {
    const videoPlaybackQuality = this.getVideoPlaybackQuality();
    if (!videoPlaybackQuality) {
      return;
    }
    logger.log('reset FPS check due to level switching');
    const { totalVideoFrames, droppedVideoFrames } = videoPlaybackQuality
    this.lastDroppedFrames = droppedVideoFrames;
    this.lastDecodedFrames = totalVideoFrames;
  }

  checkFPS(
    video: HTMLVideoElement,
    decodedFrames: number,
    droppedFrames: number,
  ) {
    const currentTime = performance.now();
    if (decodedFrames) {
      if (this.lastTime) {
        const hls = this.hls;
        const currentPeriod = currentTime - this.lastTime;
        const currentDropped = droppedFrames - this.lastDroppedFrames;
        const currentDecoded = decodedFrames - this.lastDecodedFrames;
        if (currentDecoded < hls.config.fpsDroppedMonitoringFramesRequire) {
          return;
        }
        const droppedFPS = (1000 * currentDropped) / currentPeriod;
        hls.trigger(Events.FPS_DROP, {
          currentDropped: currentDropped,
          currentDecoded: currentDecoded,
          totalDroppedFrames: droppedFrames,
        });
        if (droppedFPS > 0 && hls.config.capLevelOnFPSDrop) {
          // logger.log('checkFPS : droppedFPS/decodedFPS:' + droppedFPS/(1000 * currentDecoded / currentPeriod));
          if (
            currentDropped >
            hls.config.fpsDroppedMonitoringThreshold * currentDecoded
          ) {
            let currentLevel = hls.currentLevel;
            logger.warn(
              'drop FPS ratio greater than max allowed value for currentLevel: ' +
                currentLevel,
            );
            if (
              currentLevel > 0 &&
              (hls.autoLevelCapping === -1 ||
                hls.autoLevelCapping >= currentLevel)
            ) {
              currentLevel = currentLevel - 1;
              hls.trigger(Events.FPS_DROP_LEVEL_CAPPING, {
                level: currentLevel,
                droppedLevel: hls.currentLevel,
              });
              logger.warn('trigger level capping');
              hls.autoLevelCapping = currentLevel;
              this.streamController.nextLevelSwitch();
            }
          }
        }
      }
      this.lastTime = currentTime;
    }
  }

  getVideoPlaybackQuality() {
    if (!this.media) {
      return null;
    }
    const video = this.media;
    if (this.isVideoPlaybackQualityAvailable) {
      const { totalVideoFrames, droppedVideoFrames } = video.getVideoPlaybackQuality();
      return {
        totalVideoFrames,
        droppedVideoFrames
      }
    }
    // HTMLVideoElement doesn't include the webkit types
    return {
      totalVideoFrames: (video as any).webkitDecodedFrameCount as number,
      droppedVideoFrames: (video as any).webkitDroppedFrameCount as number,
    }
  }

  checkFPSInterval() {
    const video = this.media;
    const videoPlaybackQuality = this.getVideoPlaybackQuality();
    if (video && videoPlaybackQuality) {
      const { totalVideoFrames, droppedVideoFrames} = videoPlaybackQuality;
      this.checkFPS(video, totalVideoFrames, droppedVideoFrames);
    }
  }
}

export default FPSController;
