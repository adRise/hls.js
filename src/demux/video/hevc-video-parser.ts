import BaseVideoParser from './base-video-parser';
import {
  DemuxedHevcTrack,
  DemuxedUserdataTrack,
} from '../../types/demuxer';
import ExpGolombHEVC from '../exp-golomb-hevc';
import type { PES } from '../tsdemuxer';

class HEVCVideoParser extends BaseVideoParser {
  // https://www.codeproject.com/Tips/896030/The-Structure-of-HEVC-Video
  public parseHEVCPES(
    track: DemuxedHevcTrack,
    textTrack: DemuxedUserdataTrack,
    pes: PES,
    last: boolean,
    duration: number,
  ) {
    // We can reuse the same NAL unit parser between HEVC and AVC. The only difference is the type definition.
    const units = this.parseHEVCNALu(track, pes.data);
    const debug = false;
    // free pes.data to save up some memory
    (pes as any).data = null;

    // if new NAL units found and last sample still there, let's push ...
    // this helps parsing streams with missing AUD (only do this if AUD never found)
    if (this.VideoSample && units.length && !track.audFound) {
      this.pushAccessUnit(this.VideoSample, track);
      this.VideoSample = this.createVideoSample(false, pes.pts, pes.dts, '');
    }

    const is_new_nal = (nal_list: Uint8Array[], unit: Uint8Array) => {
      if (!nal_list.length)
        return true;

      for (const nal of nal_list) {
        if (nal.byteLength !== unit.byteLength) continue;

        for (let i = 0; i < nal.byteLength; ++i) {
          if (nal[i] !== unit[i]) break;
        }
        return false;
      }
      return true;
    };

    units.forEach((unit) => {
      let nalType: string = '';
      switch (unit.type) {
        // vps
        case 32: {
          if (is_new_nal(track.vps_nals, unit.data)) {
            const expGolombDecoder = new ExpGolombHEVC(ExpGolombHEVC.removeEmulation(unit.data));
            const vps = expGolombDecoder.readHevcVPS();
            track.vps_list.push(vps);
            track.vps_nals.push(unit.data);
          }
          if (debug) nalType = 'VPS';
          break;
        }
        // sps
        case 33: {
          if (is_new_nal(track.sps_nals, unit.data)) {
            const expGolombDecoder = new ExpGolombHEVC(ExpGolombHEVC.removeEmulation(unit.data));
            const sps = expGolombDecoder.readHevcSPS();
            track.sps_list.push(sps);
            track.sps_nals.push(unit.data);
          }

          if (!track.width && track.sps_list.length) {
            const sps = track.sps_list[0];

            track.width = sps.width;
            track.height = sps.height;
            track.pixelRatio = sps.pixelRatio;
            // TODO: `track.sps` is defined as a `number[]`, but we're setting it to a `Uint8Array[]`.
            track.sps = [unit.data] as any;
            track.duration = duration;

            const reverse_str = (str: string) => {
              return str.split('').reverse().join('');
            }

            const to_hex = (d: number) => {
              const h = (d).toString(16);
              return h.length % 2 ? '0' + h : h;
            };

            const profiles = ['', 'A', 'B', 'C'];
            const tiers = ['L', 'H'];
            const prof_compat = parseInt(reverse_str(sps.ptl.profile_compatibility_flags.toString(16)), 16).toString(16);

            // constraint bytes
            const constraints = [
              (sps.ptl.constraint_indicator_flags_high_16 >> 8) & 0xff,
              sps.ptl.constraint_indicator_flags_high_16 & 0xff,
              (sps.ptl.constraint_indicator_flags_low_32 >> 24) & 0xff,
              (sps.ptl.constraint_indicator_flags_low_32 >> 16) & 0xff,
              (sps.ptl.constraint_indicator_flags_low_32 >> 8) & 0xff,
              sps.ptl.constraint_indicator_flags_low_32 & 0xff,
            ];

            // Remove tailing 0's
            while (constraints.length && !constraints[constraints.length - 1]) {
              constraints.pop();
            }

            // Convert to hex bytes separated by dots
            let constraint = '';
            for (const num of constraints) {
                constraint += `.${to_hex(num)}`;
            }

            // Remove trailing dot
            if (constraint.length) {
              constraint = constraint.trim();
            }

            track.codec = `hvc1.${profiles[sps.ptl.profile_space]}${sps.ptl.profile_idc}.${prof_compat}.${tiers[sps.ptl.tier_flag]}${sps.ptl.level_idc}${constraint}`;
          }

          if (debug) nalType = 'SPS';
          break;
        }
        // pps
        case 34: {
          if (is_new_nal(track.pps_nals, unit.data)) {
            const expGolombDecoder = new ExpGolombHEVC(ExpGolombHEVC.removeEmulation(unit.data));
            const pps = expGolombDecoder.readHevcPPS();
            track.pps_list.push(pps);
            track.pps_nals.push(unit.data);
            track.pps = [unit.data] as any;
          }
          if (debug) nalType = 'PPS';
          break;
        }
        // aud
        case 35:
          track.audFound = true;
          if (debug) nalType = 'AUD';
          break;

        // TODO: we may need some sei messages for the init data.
        // TODO: do we need to extract 608 CC data??
        case 39:  // sei prefix
        case 40:  // sei post
          //if (is_new_nal(track.sei_nals, unit.data))
          //  track.sei_nals.push(unit.data);
          break;
      }

      // start a new AU when the pes pts changes
      if (this.VideoSample && pes.pts != this.VideoSample.pts) {
        this.pushAccessUnit(this.VideoSample, track);
        this.VideoSample = null;
      }

      if (!this.VideoSample) {
        this.VideoSample = this.createVideoSample(
          true,
          pes.pts,
          pes.dts,
          debug ? nalType : ''
        );

        this.VideoSample.frame = true;
        this.VideoSample.key = false;
      } else if (debug) {
        this.VideoSample.debug += ` ${nalType}`;
      }

      if (this.VideoSample && unit.type !== 35) {
        this.VideoSample.units.push(unit);

        if ((unit.type >= 16 && unit.type <= 23) || (unit.type >= 32 && unit.type <= 34))
          this.VideoSample.key = true;
      }
    });

    // if last PES packet, push samples
    if (last && this.VideoSample) {
      this.pushAccessUnit(this.VideoSample, track);
      this.VideoSample = null;
    }
  }

  private parseHEVCNALu(
    track: DemuxedHevcTrack,
    array: Uint8Array,
  ): Array<{
    data: Uint8Array;
    type: number;
    state?: number;
  }> {
    const len = array.byteLength;
    let state = track.naluState || 0;
    const lastState = state;
    const units = [] as Array<{
      data: Uint8Array;
      type: number;
      state?: number;
    }>;
    let i = 0;
    let value;
    let overflow;
    let unitType;
    let lastUnitStart = -1;
    let lastUnitType: number = 0;
    // logger.log('PES:' + Hex.hexDump(array));

    if (state === -1) {
      // special use case where we found 3 or 4-byte start codes exactly at the end of previous PES packet
      lastUnitStart = 0;
      // NALu type is value read from offset 0
      lastUnitType = (array[0] & 0x7E) >> 1;
      state = 0;
      i = 1;
    }

    while (i < len) {
      value = array[i++];
      // optimization. state 0 and 1 are the predominant case. let's handle them outside of the switch/case
      if (!state) {
        state = value ? 0 : 1;
        continue;
      }
      if (state === 1) {
        state = value ? 0 : 2;
        continue;
      }
      // here we have state either equal to 2 or 3
      if (!value) {
        state = 3;
      } else if (value === 1) {
        if (lastUnitStart >= 0) {
          const unit = {
            data: array.subarray(lastUnitStart, i - state - 1),
            type: lastUnitType,
          };
          // logger.log('pushing NALU, type/size:' + unit.type + '/' + unit.data.byteLength);
          units.push(unit);
        } else {
          // lastUnitStart is undefined => this is the first start code found in this PES packet
          // first check if start code delimiter is overlapping between 2 PES packets,
          // ie it started in last packet (lastState not zero)
          // and ended at the beginning of this PES packet (i <= 4 - lastState)
          const lastUnit = this.getLastNalUnit(track.samples);
          if (lastUnit) {
            if (lastState && i <= 4 - lastState) {
              // start delimiter overlapping between PES packets
              // strip start delimiter bytes from the end of last NAL unit
              // check if lastUnit had a state different from zero
              if (lastUnit.state) {
                // strip last bytes
                lastUnit.data = lastUnit.data.subarray(
                  0,
                  lastUnit.data.byteLength - lastState
                );
              }
            }
            // If NAL units are not starting right at the beginning of the PES packet, push preceding data into previous NAL unit.
            overflow = i - state - 1;
            if (overflow > 0) {
              // logger.log('first NALU found with overflow:' + overflow);
              const tmp = new Uint8Array(lastUnit.data.byteLength + overflow);
              tmp.set(lastUnit.data, 0);
              tmp.set(array.subarray(0, overflow), lastUnit.data.byteLength);
              lastUnit.data = tmp;
              lastUnit.state = 0;
            }
          }
        }
        // check if we can read unit type
        if (i < len) {
          unitType = (array[0] & 0x7E) >> 1;;

          // logger.log('find NALU @ offset:' + i + ',type:' + unitType);
          lastUnitStart = i;
          lastUnitType = unitType;
          state = 0;
        } else {
          // not enough byte to read unit type. let's read it on next PES parsing
          state = -1;
        }
      } else {
        state = 0;
      }
    }
    if (lastUnitStart >= 0 && state >= 0) {
      const unit = {
        data: array.subarray(lastUnitStart, len),
        type: lastUnitType,
        state: state,
      };
      units.push(unit);
      // logger.log('pushing NALU, type/size/state:' + unit.type + '/' + unit.data.byteLength + '/' + state);
    }
    // no NALu found
    if (units.length === 0) {
      // append pes.data to previous NAL unit
      const lastUnit = this.getLastNalUnit(track.samples);
      if (lastUnit) {
        const tmp = new Uint8Array(lastUnit.data.byteLength + array.byteLength);
        tmp.set(lastUnit.data, 0);
        tmp.set(array, lastUnit.data.byteLength);
        lastUnit.data = tmp;
      }
    }
    track.naluState = state;
    return units;
  }
}

export default HEVCVideoParser;
