import type { RationalTimestamp } from '../utils/timescale-conversion';

export interface Demuxer {
  demux(
    data: Uint8Array,
    timeOffset: number,
    isSampleAes?: boolean,
    flush?: boolean,
  ): DemuxerResult;
  demuxSampleAes(
    data: Uint8Array,
    keyData: KeyData,
    timeOffset: number,
  ): Promise<DemuxerResult>;
  flush(timeOffset?: number): DemuxerResult | Promise<DemuxerResult>;
  destroy(): void;
  resetInitSegment(
    initSegment: Uint8Array | undefined,
    audioCodec: string | undefined,
    videoCodec: string | undefined,
    trackDuration: number,
  );
  resetTimeStamp(defaultInitPTS?: RationalTimestamp | null): void;
  resetContiguity(): void;
}

export interface DemuxerResult {
  audioTrack: DemuxedAudioTrack;
  videoTrack: DemuxedVideoTrackBase;
  id3Track: DemuxedMetadataTrack;
  textTrack: DemuxedUserdataTrack;
}

export interface DemuxedTrack {
  type: string;
  id: number;
  pid: number;
  inputTimeScale: number;
  sequenceNumber: number;
  samples:
    | AudioSample[]
    | VideoSample[]
    | MetadataSample[]
    | UserdataSample[]
    | Uint8Array;
  timescale?: number;
  container?: string;
  dropped: number;
  duration?: number;
  pesData?: ElementaryStreamData | null;
  codec?: string;
}

export interface PassthroughTrack extends DemuxedTrack {
  sampleDuration: number;
  samples: Uint8Array;
  timescale: number;
  duration: number;
  codec: string;
}
export interface DemuxedAudioTrack extends DemuxedTrack {
  config?: number[] | Uint8Array;
  samplerate?: number;
  segmentCodec?: string;
  channelCount?: number;
  manifestCodec?: string;
  samples: AudioSample[];
}

export interface DemuxedVideoTrackBase extends DemuxedTrack {
  width?: number;
  height?: number;
  pixelRatio?: [number, number];
  audFound?: boolean;
  pps?: Uint8Array[];
  sps?: Uint8Array[];
  naluState?: number;
  segmentCodec?: string;
  manifestCodec?: string;
  samples: VideoSample[] | Uint8Array;
}

export interface DemuxedVideoTrack extends DemuxedVideoTrackBase {
  samples: VideoSample[];
}

export interface DemuxedHevcTrack extends DemuxedVideoTrack {
  vps_nals: Uint8Array[];
  sps_nals: Uint8Array[];
  pps_nals: Uint8Array[];
  sei_nals: Uint8Array[];

  vps_list: HevcVPS[];
  sps_list: HevcSPS[];
  pps_list: HevcPPS[];
}

export interface DemuxedMetadataTrack extends DemuxedTrack {
  samples: MetadataSample[];
}

export interface DemuxedUserdataTrack extends DemuxedTrack {
  samples: UserdataSample[];
}

export const enum MetadataSchema {
  audioId3 = 'org.id3',
  dateRange = 'com.apple.quicktime.HLS',
  emsg = 'https://aomedia.org/emsg/ID3',
}
export interface MetadataSample {
  pts: number;
  dts: number;
  duration: number;
  len?: number;
  data: Uint8Array;
  type: MetadataSchema;
}

export interface UserdataSample {
  pts: number;
  bytes?: Uint8Array;
  type?: number;
  payloadType?: number;
  uuid?: string;
  userData?: string;
  userDataBytes?: Uint8Array;
}

export interface VideoSample {
  dts: number;
  pts: number;
  key: boolean;
  frame: boolean;
  units: VideoSampleUnit[];
  debug: string;
  length: number;
}

export interface VideoSampleUnit {
  data: Uint8Array;
  type: number;
  state?: number;
}

export type AudioSample = {
  unit: Uint8Array;
  pts: number;
};

export type AudioFrame = {
  sample: AudioSample;
  length: number;
  missing: number;
};

export interface ElementaryStreamData {
  data: Uint8Array[];
  size: number;
}

export interface KeyData {
  method: string;
  key: Uint8Array;
  iv: Uint8Array;
}

export interface HevcVPS {
  video_parameter_set_id: number;
  max_layers_minus1: number;
  max_sub_layers_minus1: number;
  temporal_id_nesting_flag: number;
  ptl: HevcPTL
}

export interface HevcSPS {
  width: number;
  height: number;
  pixelRatio: [number, number];
  chroma_format: number;
  bit_depth_luma_minus8: number;
  bit_depth_chroma_minus8: number;
  max_sub_layers_minus1: number;
  ptl: HevcPTL;
  vui: HevcVUI;
}

export interface HevcPPS {
  entropy_coding_sync_enabled_flag: number;
  tiles_enabled_flag: number;
}

export interface HevcVUI {
  sar_width: number;
  sar_height: number;
  min_spatial_segmentation_idc: number;
  nal_hrd_parameters_present_flag: number;
  vcl_hrd_parameters_present_flag: number;
  sub_pic_hrd_params_present_flag: number;
}

export interface HevcPTL {
  profile_space: number;
  tier_flag: number;
  profile_idc: number;
  profile_compatibility_flags: number;
  constraint_indicator_flags_high_16: number;
  constraint_indicator_flags_low_32: number;
  level_idc: number;
}



