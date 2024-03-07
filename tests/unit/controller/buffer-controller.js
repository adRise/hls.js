import sinon from 'sinon';
import Hls from '../../../src/hls';
import BufferController from '../../../src/controller/buffer-controller';
import { ElementaryStreamTypes, Fragment } from '../../../src/loader/fragment';
import { ChunkMetadata } from '../../../src/types/transmuxer';
import { PlaylistLevelType } from '../../../src/types/loader';
import { Events } from '../../../src/events';
import { mockBufferAppendingData, mockSegmentCachesWithAllData } from '../../mocks/data';




describe('BufferController tests', function () {
  let hls;
  let bufferController;
  const sandbox = sinon.createSandbox();

  beforeEach(function () {
    hls = new Hls({});
    bufferController = new BufferController(hls);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('onBufferFlushing', function () {
    beforeEach(function () {
      bufferController.operationQueue.buffers.audio = {};
      bufferController.operationQueue.buffers.video = {};
    });

    it('flushes a specific type when provided a type', function () {
      const spy = sandbox.spy(bufferController.operationQueue, 'append');
      bufferController.onBufferFlushing(Events.BUFFER_FLUSHING, {
        startOffset: 0,
        endOffset: 10,
        type: 'video',
      });
      expect(spy).to.have.been.calledOnce;
    });

    it('flushes all source buffers when buffer flush event type is undefined', function () {
      const spy = sandbox.spy(bufferController.operationQueue, 'append');
      bufferController.onBufferFlushing(Events.BUFFER_FLUSHING, {
        startOffset: 0,
        endOffset: 10,
      });
      expect(spy).to.have.been.calledTwice;
    });
  });

  // describe('Live back buffer enforcement', function () {
  //   let mockMedia;
  //   let mockSourceBuffer;
  //   let bufStart;
  //
  //   beforeEach(function () {
  //     bufStart = 0;
  //     bufferController._levelTargetDuration = 10;
  //     bufferController.media = mockMedia = {
  //       currentTime: 0
  //     };
  //     bufferController.sourceBuffer = mockSourceBuffer = {
  //       video: {
  //         buffered: {
  //           start () {
  //             return bufStart;
  //           },
  //           length: 1
  //         }
  //       }
  //     };
  //     bufferController._live = true;
  //     hls.config.backBufferLength = 10;
  //   });
  //
  //   it('exits early if not live', function () {
  //     bufferController.flushBackBuffer();
  //     expect(removeStub).to.not.have.been.called;
  //   });
  //
  //   it('exits early if backBufferLength is not a finite number, or is less than 0', function () {
  //     hls.config.backBufferLength = 'foo';
  //     bufferController.flushBackBuffer();
  //
  //     hls.config.backBufferLength = -1;
  //     bufferController.flushBackBuffer();
  //
  //     expect(removeStub).to.not.have.been.called;
  //   });
  //
  //   it('does not flush if nothing is buffered', function () {
  //     delete mockSourceBuffer.buffered;
  //     bufferController.flushBackBuffer();
  //
  //     mockSourceBuffer = null;
  //     bufferController.flushBackBuffer();
  //
  //     expect(removeStub).to.not.have.been.called;
  //   });
  //
  //   it('does not flush if no buffered range intersects with back buffer limit', function () {
  //     bufStart = 5;
  //     mockMedia.currentTime = 10;
  //     bufferController.flushBackBuffer();
  //     expect(removeStub).to.not.have.been.called;
  //   });
  //
  //   it('does not flush if the backBufferLength is Infinity', function () {
  //     hls.config.backBufferLength = Infinity;
  //     mockMedia.currentTime = 15;
  //     bufferController.flushBackBuffer();
  //     expect(removeStub).to.not.have.been.called;
  //   });
  //
  //   it('flushes up to the back buffer limit if the buffer intersects with that point', function () {
  //     mockMedia.currentTime = 15;
  //     bufferController.flushBackBuffer();
  //     expect(removeStub).to.have.been.calledOnce;
  //     expect(bufferController.flushBufferCounter).to.equal(0);
  //     expect(removeStub).to.have.been.calledWith('video', mockSourceBuffer.video, 0, 5);
  //   });
  //
  //   it('flushes to a max of one targetDuration from currentTime, regardless of backBufferLength', function () {
  //     mockMedia.currentTime = 15;
  //     bufferController._levelTargetDuration = 5;
  //     hls.config.backBufferLength = 0;
  //     bufferController.flushBackBuffer();
  //     expect(removeStub).to.have.been.calledWith('video', mockSourceBuffer.video, 0, 10);
  //   });
  //
  //   it('should trigger clean back buffer when there are no pending appends', function () {
  //     bufferController.parent = {};
  //     bufferController.segments = [{ parent: bufferController.parent }];
  //
  //     sandbox.stub(bufferController, 'doAppending');
  //
  //     bufferController._onSBUpdateEnd();
  //
  //     expect(flushSpy).to.not.have.been.called;
  //
  //     bufferController.segments = [];
  //     bufferController._onSBUpdateEnd();
  //
  //     expect(flushSpy).to.have.been.calledOnce;
  //   });
  // });

  describe('sourcebuffer creation', function () {
    let createSbStub;
    let checkPendingTracksSpy;
    beforeEach(function () {
      createSbStub = sandbox
        .stub(bufferController, 'createSourceBuffers')
        .callsFake(() => {
          Object.keys(bufferController.pendingTracks).forEach((type) => {
            bufferController.sourceBuffer ||= {};
            bufferController.sourceBuffer[type] = {
              appendBuffer: () => {},
              remove: () => {},
            };
          });
        });
      checkPendingTracksSpy = sandbox.spy(
        bufferController,
        'checkPendingTracks',
      );
    });

    it('initializes with zero expected BUFFER_CODEC events', function () {
      expect(bufferController.bufferCodecEventsExpected).to.equal(0);
    });

    it('should throw if no media element has been attached', function () {
      bufferController.createSourceBuffers.restore();
      bufferController.pendingTracks = { video: {} };

      expect(bufferController.checkPendingTracks).to.throw();
    });

    it('exposes tracks from buffer controller through BUFFER_CREATED event', function (done) {
      bufferController.createSourceBuffers.restore();

      let video = document.createElement('video');
      bufferController.onMediaAttaching(Events.MEDIA_ATTACHING, {
        media: video,
      });
      sandbox.stub(bufferController.mediaSource, 'addSourceBuffer');

      hls.once(Hls.Events.BUFFER_CREATED, (event, data) => {
        const tracks = data.tracks;
        expect(bufferController.pendingTracks).to.not.equal(tracks);
        expect(bufferController.tracks).to.equal(tracks);
        done();
      });

      hls.once(Hls.Events.ERROR, (event, data) => {
        // Async timeout prevents assertion from throwing in event handler
        self.setTimeout(() => {
          expect(data.error.message).to.equal(null);
          done();
        }, 0);
      });

      bufferController.pendingTracks = {
        video: {
          container: 'video/mp4',
          codec: 'avc1.42e01e',
        },
      };
      bufferController.checkPendingTracks();

      video = null;
    });

    it('expects one bufferCodec event by default', function () {
      bufferController.onManifestParsed(Events.MANIFEST_PARSED, {});
      expect(bufferController.bufferCodecEventsExpected).to.equal(1);
    });

    it('expects two bufferCodec events if altAudio is signaled', function () {
      bufferController.onManifestParsed(Events.MANIFEST_PARSED, {
        altAudio: true,
      });
      expect(bufferController.bufferCodecEventsExpected).to.equal(2);
    });

    it('expects one bufferCodec event if altAudio is signaled with audio only', function () {
      bufferController.onManifestParsed(Events.MANIFEST_PARSED, {
        altAudio: true,
        audio: true,
        video: false,
      });
      expect(bufferController.bufferCodecEventsExpected).to.equal(1);
    });

    it('creates sourceBuffers when no more BUFFER_CODEC events are expected', function () {
      bufferController.pendingTracks = { video: {} };

      bufferController.checkPendingTracks();
      expect(createSbStub).to.have.been.calledOnce;
    });

    it('creates sourceBuffers on the first even if two tracks are received', function () {
      bufferController.pendingTracks = { audio: {}, video: {} };
      bufferController.bufferCodecEventsExpected = 2;

      bufferController.checkPendingTracks();
      expect(createSbStub).to.have.been.calledOnce;
    });

    it('does not create sourceBuffers when BUFFER_CODEC events are expected', function () {
      bufferController.pendingTracks = { video: {} };
      bufferController.bufferCodecEventsExpected = 1;

      bufferController.checkPendingTracks();
      expect(createSbStub).to.not.have.been.called;
      expect(bufferController.bufferCodecEventsExpected).to.equal(1);
    });

    it('checks pending tracks in onMediaSourceOpen', function () {
      bufferController._onMediaSourceOpen();
      expect(checkPendingTracksSpy).to.have.been.calledOnce;
    });

    it('checks pending tracks even when more events are expected', function () {
      bufferController.sourceBuffer = {};
      bufferController.mediaSource = { readyState: 'open' };
      bufferController.bufferCodecEventsExpected = 2;

      bufferController.onBufferCodecs(Events.BUFFER_CODECS, {});
      expect(checkPendingTracksSpy).to.have.been.calledOnce;
      expect(bufferController.bufferCodecEventsExpected).to.equal(1);

      bufferController.onBufferCodecs(Events.BUFFER_CODECS, {});
      expect(checkPendingTracksSpy).to.have.been.calledTwice;
      expect(bufferController.bufferCodecEventsExpected).to.equal(0);
    });

    it('creates the expected amount of sourceBuffers given the standard event flow', function () {
      bufferController.sourceBuffer = {};
      bufferController.mediaSource = {
        readyState: 'open',
        removeEventListener: sandbox.stub(),
      };

      bufferController.onManifestParsed(Events.MANIFEST_PARSED, {
        altAudio: true,
      });
      bufferController._onMediaSourceOpen();
      bufferController.onBufferCodecs(Events.BUFFER_CODECS, { audio: {} });
      bufferController.onBufferCodecs(Events.BUFFER_CODECS, { video: {} });

      expect(createSbStub).to.have.been.calledOnce;
      expect(createSbStub).to.have.been.calledWith({ audio: {}, video: {} });
    });
  });

  describe('onBufferCodecs', function () {
    it('calls changeType if needed and stores current track info', function () {
      const getSourceBufferTypes = sandbox
        .stub(bufferController, 'getSourceBufferTypes')
        .returns(['audio', 'video']);
      /* eslint-disable-next-line no-unused-vars */
      const appendChangeType = sandbox.stub(
        bufferController,
        'appendChangeType',
      );
      const buffer = {
        changeType: sandbox.stub(),
      };
      const originalAudioTrack = {
        id: 'main',
        codec: 'mp4a.40.2',
        levelCodec: undefined,
        container: 'audio/mp4',
        metadata: {
          channelCount: 1,
        },
      };
      const newAudioTrack = {
        id: 'main',
        codec: 'mp4a.40.5',
        levelCodec: undefined,
        container: 'audio/mp4',
        metadata: {
          channelCount: 1,
        },
      };
      bufferController.tracks = {
        audio: {
          ...originalAudioTrack,
          buffer,
        },
      };
      bufferController.onBufferCodecs(Events.BUFFER_CODECS, {
        audio: newAudioTrack,
      });
      expect(getSourceBufferTypes).to.have.been.calledOnce;
      expect(bufferController.appendChangeType).to.have.been.calledOnce;
      expect(bufferController.appendChangeType).to.have.been.calledWith(
        'audio',
        'audio/mp4;codecs=mp4a.40.5',
      );
      expect(bufferController.tracks.audio).to.deep.equal({
        buffer,
        ...newAudioTrack,
      });

      bufferController.onBufferCodecs(Events.BUFFER_CODECS, {
        audio: originalAudioTrack,
      });
      expect(getSourceBufferTypes).to.have.been.calledTwice;
      expect(bufferController.appendChangeType).to.have.been.calledTwice;
      expect(bufferController.appendChangeType).to.have.been.calledWith(
        'audio',
        'audio/mp4;codecs=mp4a.40.2',
      );
      expect(bufferController.tracks.audio).to.deep.equal({
        buffer,
        ...originalAudioTrack,
      });
    });
  });

  describe('forceDeleteSegmentFromCache', function() {
    it('will force remove it from array `segmentsCacheArr`', function() {
      var frag = {
        type: 'audio'
      };
      var frag2 = {
        type: 'video'
      }
      var frag3 = {
        type: 'video'
      }
      bufferController.segmentsCacheArr = [frag, frag2, frag3];
      bufferController.forceDeleteSegmentFromCache(1)
      expect(bufferController.segmentsCacheArr.length).to.equal(2);
    })
  });
  describe('updateSegmentsCacheViaCurrentTime', function() {
    it('it will auto remove the segment which is less than media current time', function() {
      bufferController.segmentsCacheArr = [{
        type: 'video',
        frag: {
          startDTS: 5,
          endDTS: 10,
        }
      },{
        type: 'video',
        frag: {
          startDTS: 10,
          endDTS: 15,
        }
      }];
      bufferController.media = {
        currentTime: 11,
      }
      bufferController.updateSegmentsCacheViaCurrentTime();
      expect(bufferController.segmentsCacheArr.length).to.equal(1);
    });
    it('it will stop remove until meet a fragment endPTS > media current time', function() {
      bufferController.segmentsCacheArr = [{
        type: 'video',
        frag: {
          startDTS: 5,
          endDTS: 10,
        }
      },{
        type: 'video',
        frag: {
          startDTS: 10,
          endDTS: 15,
        }
      },
      {
        type: 'video',
        frag: {
          startDTS: 15,
          endDTS: 20,
        }
      }];
      bufferController.media = {
        currentTime: 16,
      }
      bufferController.updateSegmentsCacheViaCurrentTime();
      expect(bufferController.segmentsCacheArr.length).to.equal(1);
      expect(bufferController.segmentsCacheArr[0].frag.startDTS).to.equal(15);
    });
  });

  describe('appendSegmentCache', function() {
    it('if enableSegmentsCache to be `false`, the `segmentsCacheArr` will not be update', function() {
      bufferController.appendSegmentCache(mockBufferAppendingData);
      expect(bufferController.segmentsCacheArr.length).to.equal(0);
    });
    it('the `segmentsCacheArr` will be updated if enableSegmentsCache = true', function() {
      bufferController.enableSegmentsCache = true;
      bufferController.appendSegmentCache(mockBufferAppendingData);
      expect(bufferController.segmentsCacheArr.length).to.equal(1);
    });
  });

  describe('forceReleaseSegmentsCache', function() {
    it('it will auto remove the segment which is less than media current time and `revertSegmentsCacheDuration`config ', function() {
      const hls2 = new Hls({
        revertSegmentsCacheDuration: 10,
      });
      const bufferController2 = new BufferController(hls2);
      bufferController2.segmentsCacheArr = [{
        type: 'video',
        frag: {
          startDTS: 5,
          endDTS: 10,
        }
      },{
        type: 'video',
        frag: {
          startDTS: 10,
          endDTS: 15,
        }
      },
      {
        type: 'video',
        frag: {
          startDTS: 15,
          endDTS: 20,
        }
      },
      {
        type: 'video',
        frag: {
          startDTS: 20,
          endDTS: 25,
        }
      },
      {
        type: 'video',
        frag: {
          startDTS: 25,
          endDTS: 30,
        }
      }];
      bufferController2.media = {
        currentTime: 12,
      }
      bufferController2.forceReleaseSegmentsCache();
      expect(bufferController2.segmentsCacheArr.length).to.equal(3);
      const endData = bufferController2.segmentsCacheArr[bufferController2.segmentsCacheArr.length - 1]
      expect(endData.frag.startDTS).to.not.equal(25);
    });
    it('it will not call `forceDeleteSegmentFromCache` when segmentsCache is empty', function() {
      const spyForceDeleteSegmentFromCache = sandbox.spy(bufferController, 'forceDeleteSegmentFromCache');
      bufferController.forceReleaseSegmentsCache();
      expect(spyForceDeleteSegmentFromCache).to.not.have.calledOnce;
    });
  });

  describe('loadSegmentsFromCache', function() {
    it('it will not set revertSegmentsCacheTaskSet if segmentsCache is empty', function() {
      bufferController.loadSegmentsFromCache();
      expect(bufferController.revertSegmentsCacheTaskSet.size).to.equal(0);
    });
    it('it will trigger error if segmentsCache only one type chunk', function() {
      const triggerSpy = sandbox.spy(hls, 'trigger');
      bufferController.segmentsCacheArr = [{
        type: 'video',
        frag: {
          startDTS: 5,
          endDTS: 10,
        }
      }];
      bufferController.loadSegmentsFromCache();
      expect(triggerSpy).to.have.been.calledOnce;
    });
    it('it will trigger error if segmentsCache contains no init fragment data', function() {
      const triggerSpy = sandbox.spy(hls, 'trigger');
      bufferController.segmentsCacheArr = [{
        type: 'video',
        frag: {
          startDTS: 5,
          endDTS: 10,
        }
      },
      {
        type: 'audio',
        frag: {
          startDTS: 5,
          endDTS: 10,
        }
      }];
      bufferController.loadSegmentsFromCache();
      expect(triggerSpy).to.have.been.calledOnce;
    });
    it('it will call `onBufferAppending` if segmentsCache is correct chunks', function() {
      const spyBufferAppending = sandbox.stub(bufferController, 'onBufferAppending');
      bufferController.segmentsCacheArr = JSON.parse(JSON.stringify(mockSegmentCachesWithAllData));
      bufferController.loadSegmentsFromCache();
      expect(spyBufferAppending).to.have.been.called;
    });
    it('it will add `START_REVERT_SEGMENT_CACHE_FLAG = -1000` flag if segmentsCache is correct chunks', function() {
      sandbox.stub(bufferController, 'onBufferAppending');
      bufferController.segmentsCacheArr = JSON.parse(JSON.stringify(mockSegmentCachesWithAllData));
      bufferController.loadSegmentsFromCache();
      expect(bufferController.revertSegmentsCacheTaskSet.has(-1000)).to.equal(true);
    });
  });

  describe('removeFinishedSegmentCacheTask', function() {
    it('it will do nothing if no media', function() {
      bufferController.revertSegmentsCacheTaskSet.add(1);
      bufferController.removeFinishedSegmentCacheTask(1);
      expect(bufferController.revertSegmentsCacheTaskSet.size).to.equal(1);
    });

    it('it will delete revertSegmentsCacheTaskSet item via the specify parma', function() {
      bufferController.revertSegmentsCacheTaskSet.add(1);
      bufferController.revertSegmentsCacheTaskSet.add(2);
      bufferController.media = {};
      bufferController.removeFinishedSegmentCacheTask(1);
      expect(bufferController.revertSegmentsCacheTaskSet.has(1)).to.equal(false);
      expect(bufferController.revertSegmentsCacheTaskSet.has(2)).to.equal(true);
    });

  });

  describe('if `revertSegmentsCacheDuration` is set more than 0 ', function() {

    it('enableSegmentsCache will be `true` if `revertSegmentsCacheDuration` > 0', function () {
      const hls2 = new Hls({
        revertSegmentsCacheDuration: 10,
      });;
      const bufferController2 = new BufferController(hls2);
      expect(bufferController2.enableSegmentsCache).to.equal(true);
    })
  })
});
