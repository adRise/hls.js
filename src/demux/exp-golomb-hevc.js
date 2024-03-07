/**
 * Parser for exponential Golomb codes, a variable-bitwidth number encoding scheme used by h264.
 */

import ExpGolomb from './video/exp-golomb';


class PTL {
  constructor() {
    this.profile_space = 0;
    this.tier_flag = 0;
    this.profile_idc = 0;
    this.profile_compatibility_flags = 0xffffffff;
    this.constraint_indicator_flags_high_16 = 0xffffffff;
    this.constraint_indicator_flags_low_32= 0xffffffff;
    this.level_idc = 0;
  }
}

class VUI {
  constructor() {
    this.sar_width = 1;
    this.sar_height = 1;
    this.min_spatial_segmentation_idc = 0;
    this.nal_hrd_parameters_present_flag = 0;
    this.vcl_hrd_parameters_present_flag = 0;
    this.sub_pic_hrd_params_present_flag = 0;
  }

}

class VPS {
  constructor() {
    this.video_parameter_set_id = 0;
    this.max_layers_minus1 = 0;
    this.max_sub_layers_minus1 = 0;
    this.temporal_id_nesting_flag = 0;
    this.ptl = new PTL();
  }

}

class SPS {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.pixelRatio = [1, 1];
    this.chroma_format = 0;
    this.bit_depth_luma_minus8 = 0;
    this.bit_depth_chroma_minus8 = 0;
    this.max_sub_layers_minus1 = 0;
    this.ptl = new PTL();
    this.vui = new VUI();
  }
}

class PPS {
  constructor() {
    this.entropy_coding_sync_enabled_flag = 0;
    this.tiles_enabled_flag = 0;
  }

}

class ExpGolombHEVC extends ExpGolomb {
  constructor(data) {
    super(data);
    this.loadWord();
  }

  /**
  * To prevent start code emulations an encoder has to insert so called "emulation prevention byte" 0x03, in other words to replace each emulated start code 0x000001 (within NAL data) with 0x00000301. Formally this post-processing operation is called the conversion from RBSP (Raw Byte Sequence Payload) into SODB (String of Data Bits).
  * https://www.ramugedia.com/start-code-emulation
  * zh: https://blog.csdn.net/yangleo1987/article/details/54838567
  * @param data
  * @returns dataWithoutEmulation
  */
  static removeEmulation(data) {
    if (data.byteLength > 2) {
      const output = new Uint8Array(data.byteLength);
      let src = 0;
      let dst = 0;

      for (; src < data.byteLength - 2; ++src) {
        if (data[src] !== 0 || data[src + 1] !== 0 || data[src + 2] !== 0x03) {
          output[dst++] = data[src];
        } else {
          output[dst++] = data[src++];
          output[dst++] = data[src++];
          // skip emmulation prevention byte
        }
      }

      // Copy two bytes
      while (src < data.byteLength) {
        output[dst++] = data[src++];
      }

      if (dst !== src) {
        return output.subarray(0, dst);
      } else {
        return output;
      }
    } else {
      return data;
    }
  }
  /**
  * VPS is used to transmit information required for multi-layer and sub-layer video coding, and provides global information of the entire video sequence. Each layer of a given video sequence refers to the same VPS, regardless of whether they have the same SPS.
  * https://blog.krybot.com/a?ID=01600-4240a0a8-a9f1-4203-a7ad-1dc4715eb6d6
  * Similar code: https://github.com/chemag/h265nal/blob/master/src/h265_vps_parser.cc
  */
  readHevcVPS() {
    const readBits = this.readBits.bind(this);
    const vps = new VPS();

    // Skip nal header
    readBits(16);

    vps.video_parameter_set_id = readBits(4);
    readBits(2);
    vps.max_layers_minus1 = readBits(6);
    vps.max_sub_layers_minus1 = readBits(3);
    vps.temporal_id_nesting_flag = readBits(1);
    vps.ptl = this.readPtl(vps.max_sub_layers_minus1);

    return vps;
  }

/**
  * Read a sequence parameter set and return some interesting video
  * properties. A sequence parameter set is the H265 metadata that
  * describes the properties of upcoming video frames.
  * @param data {Uint8Array} the bytes of a sequence parameter set
  * @return {object} an object with configuration parsed from the
  * sequence parameter set, including the dimensions of the
  * associated video frames.
  * https://github.com/chemag/h265nal/blob/master/src/h265_sps_parser.cc
  * SPS contains data that is common to all the pictures in a Sequence Of Pictures (SOP).
  */
  readHevcSPS() {
    const readBits = this.readBits.bind(this);
    const readUEG = this.readUEG.bind(this);
    const readEG = this.readEG.bind(this);

    const sps = new SPS();

    // Skip nal header
    this.skipBits(16);

    readBits(4); // video_parameter_set_id
    sps.max_sub_layers_minus1 = readBits(3);
    readBits(1); // temporal_id_nesting_flag

    sps.ptl = this.readPtl(sps.max_sub_layers_minus1);

    readUEG(); // seq_parameter_set_id
    sps.chroma_format = readUEG();

    if (sps.chroma_format == 3)
        readBits(1); // separate_colour_plane_flag

    sps.width = readUEG();
    sps.height = readUEG();

    const conformance_window_flag = readBits(1);
    if (conformance_window_flag)
    {
        readUEG(); // window_left_offset
        readUEG(); // window_right_offset
        readUEG(); // window_top_offset
        readUEG(); // window_bottom_offset
    }

    sps.bit_depth_luma_minus8 = readUEG();
    sps.bit_depth_chroma_minus8 = readUEG();
    const log2_max_pic_order_cnt_lsb_minus4 = readUEG();

    const sps_sub_layer_ordering_info_present_flag = readBits(1);
    if (!sps_sub_layer_ordering_info_present_flag)
    {
        for (let i = 0; i <= sps.max_sub_layers_minus1; ++i)
        {
            readUEG(); // max_dec_pic_buffering_minus1
            readUEG(); // max_num_reorder_pics
            readUEG(); // max_latency_increase_plus1
        }
    }

    readUEG(); // log2_min_luma_coding_block_size_minus3
    readUEG(); // log2_diff_max_min_luma_coding_block_size
    readUEG(); // log2_min_transform_block_size_minus2
    readUEG(); // log2_diff_max_min_transform_block_size
    readUEG(); // max_transform_hierarchy_depth_inter
    readUEG(); // max_transform_hierarchy_depth_intra

    const scaling_list_enabled_flag = readBits(1);
    const sps_scaling_list_data_present_flag = readBits(1);

    if (scaling_list_enabled_flag && sps_scaling_list_data_present_flag)
    {
        let num_coeffs = 0;

        for (let i = 0; i < 4; i++)
        {
            for (let j = 0; j < (i == 3 ? 2 : 6); j++)
            {
                if (!readBits(1))      // scaling_list_pred_mode_flag[i][j]
                {
                    readUEG();    // scaling_list_pred_matrix_id_delta[i][j]
                }
                else
                {
                    num_coeffs = Math.min(64, 1 << (4 + (i << 1)));

                    if (i > 1)
                        readEG();; // scaling_list_dc_coef_minus8[i-2][j]

                    for (let k = 0; k < num_coeffs; k++)
                        readEG();; // scaling_list_delta_coef
                }
            }
        }
    }

    readBits(1); // amp_enabled_flag
    readBits(1); //sample_adaptive_offset_enabled_flag

    const pcm_enabled_flag = readBits(1);
    if (pcm_enabled_flag)
    {
        readBits(4); // pcm_sample_bit_depth_luma_minus1
        readBits(4); // pcm_sample_bit_depth_chroma_minus1
        readUEG(); // log2_min_pcm_luma_coding_block_size_minus3
        readUEG(); // log2_diff_max_min_pcm_luma_coding_block_size
        readBits(1); // pcm_loop_filter_disabled_flag
    }

    const num_short_term_ref_pic_sets = readUEG();

    for (let i = 0; i < num_short_term_ref_pic_sets; i++)
        this.read_short_term_ref_set(num_short_term_ref_pic_sets);

    const long_term_ref_pics_present_flag = readBits(1);
    if (long_term_ref_pics_present_flag)
    {
        const num_long_term_ref_pics_sps = readUEG();

        for (let i = 0; i < num_long_term_ref_pics_sps; i++)
        {
            const len = Math.min(log2_max_pic_order_cnt_lsb_minus4 + 4, 16);
            readBits(len); // lt_ref_pic_poc_lsb_sps[i]
            readBits(1);   // used_by_curr_pic_lt_sps_flag[i]
        }
    }

    readBits(1); // temporal_mvp_enabled_flag
    readBits(1); // strong_intra_smoothing_enabled_flag

    if (readBits(1)) // vui_parameters_present_flag
      sps.vui = this.read_vui(sps.max_sub_layers_minus1);

    return sps;
  }
  /**
  * PPS contains data that is common to the entire picture.
  * @returns
  * https://github.com/chemag/h265nal/blob/master/src/h265_vps_parser.cc
  */
  readHevcPPS() {
    const readBits = this.readBits.bind(this);
    const readUEG = this.readUEG.bind(this);
    const readEG = this.readEG.bind(this);

    const pps = new PPS();

    // Skip nal header
    readBits(16);

    readUEG(); // pps.pic_parameter_set_id
    readUEG(); // pps.seq_parameter_set_id

    readBits(1); // pps.dependent_slice_segments_enabled_flag
    readBits(1); // pps.output_flag_present_flag
    readBits(3); // pps.num_extra_slice_header_bits
    readBits(1); // pps.sign_data_hiding_enabled_flag
    readBits(1); // pps.cabac_init_present_flag

    readUEG(); // pps.num_ref_idx_l0_default_active_minus1
    readUEG(); // pps.num_ref_idx_l1_default_active_minus1
    readEG(); // pps.init_qp_minus26

    readBits(1); // pps.constrained_intra_pred_flag
    readBits(1); // pps.transform_skip_enabled_flag

    if (readBits(1)) // pps.cu_qp_delta_enabled_flag
        readUEG(); // pps.diff_cu_qp_delta_depth

    readEG(); // pps.cb_qp_offset
    readEG(); // pps.cr_qp_offset

    readBits(1); // pps.slice_chroma_qp_offsets_present_flag
    readBits(1); // pps.weighted_pred_flag
    readBits(1); // pps.weighted_bipred_flag
    readBits(1); // pps.transquant_bypass_enabled_flag

    pps.tiles_enabled_flag = readBits(1);
    pps.entropy_coding_sync_enabled_flag = readBits(1);

    return pps;
  }
  /**
  * Extract Profile, Tier, Level information
  * Profile: A profile is a defined set of coding tools that can be used to create a bitstream that conforms to that profile.An encoder for a profile may choose which coding tools to use as long as it generates a conforming bitstream while a decoder for a profile must support all coding tools that can be used in that profile.
  * Tier: The HEVC standard defines two tiers: Main and High. The tiers were made to deal with applications that differ in terms of their maximum bit rate.
  * Level: The HEVC standard defines thirteen levels.A level is a set of constraints for a bitstream. For levels below level 4 only the Main tier is allowed.
  * @param max_sub_layers_minus1
  * @returns
  * https://github.com/chemag/h265nal/blob/master/src/h265_profile_tier_level_parser.cc
  */
  readPtl(max_sub_layers_minus1) {
    const readBits = this.readBits.bind(this);
    const ptl = new PTL();

    const sub_layer_profile_present_flag = [];
    const sub_layer_level_present_flag = [];

    ptl.profile_space = readBits(2);
    ptl.tier_flag = readBits(1);
    ptl.profile_idc = readBits(5);
    ptl.profile_compatibility_flags = readBits(32);
    ptl.constraint_indicator_flags_high_16 = readBits(16);
    ptl.constraint_indicator_flags_low_32 = readBits(32);
    ptl.level_idc = readBits(8);

    for (let i = 0; i < max_sub_layers_minus1; ++i)
    {
      sub_layer_profile_present_flag.push(readBits(1));
      sub_layer_level_present_flag.push(readBits(1));
    }

    if (max_sub_layers_minus1 > 0)
    {
        for (let i = max_sub_layers_minus1; i < 8; ++i)
            readBits(2); // reserved_zero_2bits[i]
    }

    for (let i = 0; i < max_sub_layers_minus1; ++i)
    {
        if (sub_layer_profile_present_flag[i])
        {
            /*
            * sub_layer_profile_space[i]                     u(2)
            * sub_layer_tier_flag[i]                         u(1)
            * sub_layer_profile_idc[i]                       u(5)
            * sub_layer_profile_compatibility_flag[i][0..31] u(32)
            * sub_layer_progressive_source_flag[i]           u(1)
            * sub_layer_interlaced_source_flag[i]            u(1)
            * sub_layer_non_packed_constraint_flag[i]        u(1)
            * sub_layer_frame_only_constraint_flag[i]        u(1)
            * sub_layer_reserved_zero_44bits[i]              u(44)
            */
            readBits(32);
            readBits(32);
            readBits(24);
        }

        if (sub_layer_level_present_flag[i])
            readBits(8);
    }

    return ptl;
  }
  /**
  * http://what-when-how.com/Tutorial/topic-397pct9eq3/High-Efficiency-Video-Coding-HEVC-49.html
  * @param num_short_term_ref_pic_sets
  */
  read_short_term_ref_set(num_short_term_ref_pic_sets) {
    const readBits = this.readBits.bind(this);
    const readUEG = this.readUEG.bind(this);

    for (let i = 0; i < num_short_term_ref_pic_sets; ++i)
    {
      if (i && readBits(1))  // inter_ref_pic_set_prediction_flag
      {
        readBits(1);  // delta_rps_sign
        readUEG();    // abs_delta_rps_minus1

        for (;;)
        {
          if (!readBits(1) &&    // used_by_curr_pic_flag
              !readBits(1))      // use_delta_flag
          {
            break;
          }
        }
      }
      else
      {
        const num_negative_pics = readUEG();
        const num_positive_pics = readUEG();

        for (i = 0; i < num_negative_pics; i++)
        {
          readUEG();    // delta_poc_s0_minus1[rps_idx]
          readBits(1);  // used_by_curr_pic_s0_flag[rps_idx]
        }

        for (i = 0; i < num_positive_pics; i++)
        {
          readUEG();   // delta_poc_s1_minus1[rps_idx]
          readBits(1); //    used_by_curr_pic_s1_flag[rps_idx]
        }
      }
    }
  }
  /**
  * http://what-when-how.com/Tutorial/topic-397pct9eq3/High-Efficiency-Video-Coding-HEVC-55.html
  * @param max_sub_layers_minus1
  * @returns
  */
  read_vui(max_sub_layers_minus1) {
    const readBits = this.readBits.bind(this);
    const readUEG = this.readUEG.bind(this);

    const vui = new VUI();

    if (readBits(1)) // vui.aspect_ratio_info_present_flag
    {
        const aspect_ratio_idc = readBits(8);
        if (aspect_ratio_idc == 255)
        {
          vui.sar_width = readBits(16);
          vui.sar_height = readBits(16);
        }
    }

    if (readBits(1)) // vui.overscan_info_present_flag
        readBits(1); // vui.overscan_appropriate_flag

    if (readBits(1)) // vui.video_signal_type_present_flag
    {
        readBits(3); // vui.video_format
        readBits(1); // vui.video_full_range_flag

        if (readBits(1)) // vui.colour_description_present_flag
        {
            readBits(8); // vui.colour_primaries
            readBits(8); // vui.transfer_characteristics
            readBits(8); // vui.matrix_coeffs
        }
    }

    if (readBits(1)) // vui.chroma_loc_info_present_flag
    {
        readUEG(); // vui.chroma_sample_loc_type_top_field
        readUEG(); // vui.chroma_sample_loc_type_bottom_field
    }

    readBits(1); // vui.neutral_chroma_indication_flag
    readBits(1); // vui.field_seq_flag
    readBits(1); // vui.frame_field_info_present_flag

    if (readBits(1)) // vui.default_display_window_flag
    {
        readUEG(); // vui.display_window_left_offset
        readUEG(); // vui.display_window_right_offset
        readUEG(); // vui.display_window_top_offset
        readUEG(); // vui.display_window_bottom_offset
    }

    if (readBits(1)) // vui.vui_timing_info_present_flag
    {
        readBits(32); // vui.num_units_in_tick
        readBits(32); // vui.time_scale

        if (readBits(1)) // vui.poc_proportional_to_timing_flag
            readUEG(); // vui.num_ticks_poc_diff_one_minus1

        if (readBits(1)) // vui.vui_hrd_parameters_present_flag
        {
            vui.nal_hrd_parameters_present_flag = readBits(1);
            vui.vcl_hrd_parameters_present_flag = readBits(1);

            if (vui.nal_hrd_parameters_present_flag || vui.vcl_hrd_parameters_present_flag)
            {
                vui.sub_pic_hrd_params_present_flag = readBits(1);
                if (vui.sub_pic_hrd_params_present_flag)
                {
                    readBits(8); // vui.tick_divisor_minus2
                    readBits(5); // vui.du_cpb_removal_delay_increment_length_minus1
                    readBits(1); // vui.sub_pic_cpb_params_in_pic_timing_sei_flag
                    readBits(5); // vui.dpb_output_delay_du_length_minus1
                }

                readBits(4); // vui.bit_rate_scale
                readBits(4); // vui.cpb_size_scale

                if (vui.sub_pic_hrd_params_present_flag)
                    readBits(4); // vui.cpb_size_du_scale

                readBits(5); // vui.initial_cpb_removal_delay_length_minus1
                readBits(5); // vui.au_cpb_removal_delay_length_minus1
                readBits(5); // vui.dpb_output_delay_length_minus1
            }

            this.read_vui_headers(max_sub_layers_minus1, vui);
        }
    }

    if (readBits(1)) // vui.bitstream_restriction_flag
    {
        readBits(1); // vui.tiles_fixed_structure_flag
        readBits(1); // vui.motion_vectors_over_pic_boundaries_flag
        readBits(1); // vui.restricted_ref_pic_lists_flag
        vui.min_spatial_segmentation_idc = readUEG();

        readUEG(); // vui.max_bytes_per_pic_denom
        readUEG(); // vui.max_bits_per_min_cu_denom
        readUEG(); // vui.log2_max_mv_length_horizontal
        readUEG(); // vui.log2_max_mv_length_vertical
    }

    return vui;
  }

  read_vui_headers(max_sub_layers_minus1, vui) {
    const readBits = this.readBits.bind(this);
    const readUEG = this.readUEG.bind(this);

    for (let i = 0; i <= max_sub_layers_minus1; ++i)
      {
          let cpb_cnt_minus1 = 0;
          let low_delay_hrd_flag = 0;
          let fixed_pic_rate_within_cvs_flag = 0;
          const fixed_pic_rate_general_flag = readBits(1);

          if (!fixed_pic_rate_general_flag)
              fixed_pic_rate_within_cvs_flag = readBits(1);

          if (fixed_pic_rate_within_cvs_flag)
              readUEG(); // elemental_duration_in_tc_minus1
          else
              low_delay_hrd_flag = readBits(1);

          if (!low_delay_hrd_flag)
              cpb_cnt_minus1 = readUEG();

          if (vui.nal_hrd_parameters_present_flag)
              this.read_vui_sub_layer_header(cpb_cnt_minus1, vui);

          if (vui.vcl_hrd_parameters_present_flag)
            this.read_vui_sub_layer_header(cpb_cnt_minus1, vui);
      }
  }

  read_vui_sub_layer_header(cpb_cnt_minus1, vui) {
    const readBits = this.readBits.bind(this);
    const readUEG = this.readUEG.bind(this);

    for (let i = 0; i <= cpb_cnt_minus1; i++)
    {
        readUEG(); // bit_rate_value_minus1
        readUEG(); // cpb_size_value_minus1

        if (vui.sub_pic_hrd_params_present_flag)
        {
            readUEG(); // cpb_size_du_value_minus1
            readUEG(); // bit_rate_du_value_minus1
        }
    }

    readBits(1); // cbr_flag
  }
}

export default ExpGolombHEVC;
