import { Fragment } from '../../src/loader/fragment';
import { PlaylistLevelType } from '../../src/types/loader';
import { ChunkMetadata } from '../../src/types/transmuxer';

function fragment(options) {
  const frag = new Fragment(PlaylistLevelType.MAIN, '');
  Object.assign(frag, options);
  return frag;
}

export const mockFragments = [
  fragment({
    programDateTime: 1505502661523,
    level: 2,
    duration: 5.0,
    start: 0,
    sn: 0,
    cc: 0,
  }),
  // Discontinuity with PDT 1505502671523 which does not exist in level 1 as per fragPrevious
  fragment({
    programDateTime: 1505502671523,
    level: 2,
    duration: 5.0,
    start: 5.0,
    sn: 1,
    cc: 1,
  }),
  fragment({
    programDateTime: 1505502676523,
    level: 2,
    duration: 5.0,
    start: 10.0,
    sn: 2,
    cc: 1,
  }),
  fragment({
    programDateTime: 1505502681523,
    level: 2,
    duration: 5.0,
    start: 15.0,
    sn: 3,
    cc: 1,
  }),
  fragment({
    programDateTime: 1505502686523,
    level: 2,
    duration: 5.0,
    start: 20.0,
    sn: 4,
    cc: 1,
  }),
];

export const mockBufferAppendingData = {
  type: 'video',
  frag: fragment({
    programDateTime: 1505502661523,
    level: 2,
    duration: 5.0,
    start: 0,
    sn: 0,
    cc: 0,
  }),
  part: null,
  chunkMeta: new ChunkMetadata(0, 0, 0, 0),
  parent: PlaylistLevelType.MAIN,
  data: new Uint8Array(),
  timestampOffset: 0,
  isInitSegment: false,
  isEndSegment: false,
  adIndex: 0,
  skipDeviatedCheck: false,
};


export const mockInitVideoFragment = {
  type: 'video',
  frag: fragment({
    programDateTime: 1505502661523,
    level: 2,
    duration: 5.0,
    start: 0,
    sn: 0,
    cc: 0,
  }),
  part: null,
  parent: PlaylistLevelType.MAIN,
  data: new Uint8Array(),
  timestampOffset: 0,
  isInitSegment: true,
  isEndSegment: false,
  sn: 'init',
  stats: {
    buffering: {
      start: 0,
      end: 3,
      first: 0,
    }
  }
};

export const mockInitAudioFragment = {
  type: 'audio',
  frag: fragment({
    programDateTime: 1505502661523,
    level: 2,
    duration: 5.0,
    start: 0,
    sn: 0,
    cc: 0,
  }),
  part: null,
  parent: PlaylistLevelType.MAIN,
  data: new Uint8Array(),
  timestampOffset: 0,
  isInitSegment: true,
  isEndSegment: false,
  sn: 'init',
  stats: {
    buffering: {
      start: 0,
      end: 3,
      first: 0,
    }
  }
};


export const mockSegmentCachesWithAllData = [
  {
    type: 'video',
    frag: {
      startDTS: 5,
      endDTS: 10,
      sn: 2,
      initSegment: mockInitVideoFragment,
      stats: {
        buffering: {
          start: 5,
          end: 10,
          first: 0,
        }
      }
    }
  },{
    type: 'audio',
    frag: {
      startDTS: 5,
      endDTS: 10,
      sn: 2,
      initSegment: mockInitVideoFragment,
      stats: {
        buffering: {
          start: 5,
          end: 10,
          first: 0,
        }
      }
    }
  }
];
