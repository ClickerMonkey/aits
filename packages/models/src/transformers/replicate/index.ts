import { ReplicateTransformer } from '@aeye/replicate';

import abiruyt_text_extract_ocr from './abiruyt-text-extract-ocr';
import adidoes_whisperx_video_transcribe from './adidoes-whisperx-video-transcribe';
import adirik_e5_mistral_7b_instruct from './adirik-e5-mistral-7b-instruct';
import adirik_kosmos_g from './adirik-kosmos-g';
import adirik_owlvit_base_patch32 from './adirik-owlvit-base-patch32';
import adirik_realvisxl_v3_0_turbo from './adirik-realvisxl-v3-0-turbo';
import adirik_styletts2 from './adirik-styletts2';
import adirik_udop_large from './adirik-udop-large';
import afiaka87_tortoise_tts from './afiaka87-tortoise-tts';
import ai_forever_kandinsky_2_2 from './ai-forever-kandinsky-2-2';
import ai_forever_kandinsky_2 from './ai-forever-kandinsky-2';
import alexgenovese_upscaler from './alexgenovese-upscaler';
import andreasjansson_blip_2 from './andreasjansson-blip-2';
import andreasjansson_clip_features from './andreasjansson-clip-features';
import andreasjansson_llama_2_13b_embeddings from './andreasjansson-llama-2-13b-embeddings';
import andreasjansson_musicgen_looper from './andreasjansson-musicgen-looper';
import anthropic_claude_3_5_sonnet from './anthropic-claude-3-5-sonnet';
import anthropic_claude_3_7_sonnet from './anthropic-claude-3-7-sonnet';
import anthropic_claude_4_sonnet from './anthropic-claude-4-sonnet';
import arielreplicate_deoldify_image from './arielreplicate-deoldify_image';
import awerks_neon_tts from './awerks-neon-tts';
import awilliamson10_meta_nougat from './awilliamson10-meta-nougat';
import beautyyuyanli_multilingual_e5_large from './beautyyuyanli-multilingual-e5-large';
import black_forest_labs_flux_1_1_pro_ultra from './black-forest-labs-flux-1-1-pro-ultra';
import black_forest_labs_flux_1_1_pro from './black-forest-labs-flux-1-1-pro';
import black_forest_labs_flux_2_dev from './black-forest-labs-flux-2-dev';
import black_forest_labs_flux_2_flex from './black-forest-labs-flux-2-flex';
import black_forest_labs_flux_2_pro from './black-forest-labs-flux-2-pro';
import black_forest_labs_flux_canny_dev from './black-forest-labs-flux-canny-dev';
import black_forest_labs_flux_canny_pro from './black-forest-labs-flux-canny-pro';
import black_forest_labs_flux_depth_dev from './black-forest-labs-flux-depth-dev';
import black_forest_labs_flux_depth_pro from './black-forest-labs-flux-depth-pro';
import black_forest_labs_flux_dev_lora from './black-forest-labs-flux-dev-lora';
import black_forest_labs_flux_dev from './black-forest-labs-flux-dev';
import black_forest_labs_flux_fill_dev from './black-forest-labs-flux-fill-dev';
import black_forest_labs_flux_fill_pro from './black-forest-labs-flux-fill-pro';
import black_forest_labs_flux_kontext_dev from './black-forest-labs-flux-kontext-dev';
import black_forest_labs_flux_kontext_max from './black-forest-labs-flux-kontext-max';
import black_forest_labs_flux_kontext_pro from './black-forest-labs-flux-kontext-pro';
import black_forest_labs_flux_pro_finetuned from './black-forest-labs-flux-pro-finetuned';
import black_forest_labs_flux_pro_trainer from './black-forest-labs-flux-pro-trainer';
import black_forest_labs_flux_pro from './black-forest-labs-flux-pro';
import black_forest_labs_flux_redux_dev from './black-forest-labs-flux-redux-dev';
import black_forest_labs_flux_redux_schnell from './black-forest-labs-flux-redux-schnell';
import black_forest_labs_flux_schnell from './black-forest-labs-flux-schnell';
import bria_eraser from './bria-eraser';
import bria_expand_image from './bria-expand-image';
import bria_fibo from './bria-fibo';
import bria_generate_background from './bria-generate-background';
import bria_genfill from './bria-genfill';
import bria_image_3_2 from './bria-image-3-2';
import bria_increase_resolution from './bria-increase-resolution';
import bytedance_bagel from './bytedance-bagel';
import bytedance_dolphin from './bytedance-dolphin';
import bytedance_flux_pulid from './bytedance-flux-pulid';
import bytedance_pulid from './bytedance-pulid';
import bytedance_sdxl_lightning_4step from './bytedance-sdxl-lightning-4step';
import bytedance_seededit_3_0 from './bytedance-seededit-3-0';
import bytedance_seedream_3 from './bytedance-seedream-3';
import bytedance_seedream_4 from './bytedance-seedream-4';
import camenduru_metavoice from './camenduru-metavoice';
import center_for_curriculum_redesign_bge_1_5_query_embeddings from './center-for-curriculum-redesign-bge_1-5_query_embeddings';
import chenxwh_openvoice from './chenxwh-openvoice';
import chigozienri_mediapipe_face from './chigozienri-mediapipe-face';
import cjwbw_bigcolor from './cjwbw-bigcolor';
import cjwbw_canary_1b from './cjwbw-canary-1b';
import cjwbw_cogvlm from './cjwbw-cogvlm';
import cjwbw_docentr from './cjwbw-docentr';
import cjwbw_face_align_cog from './cjwbw-face-align-cog';
import cjwbw_internlm_xcomposer from './cjwbw-internlm-xcomposer';
import cjwbw_night_enhancement from './cjwbw-night-enhancement';
import cjwbw_parler_tts from './cjwbw-parler-tts';
import cjwbw_real_esrgan from './cjwbw-real-esrgan';
import cjwbw_rudalle_sr from './cjwbw-rudalle-sr';
import cjwbw_seamless_communication from './cjwbw-seamless_communication';
import cjwbw_supir_v0f from './cjwbw-supir-v0f';
import cjwbw_supir_v0q from './cjwbw-supir-v0q';
import cjwbw_supir from './cjwbw-supir';
import cjwbw_voicecraft from './cjwbw-voicecraft';
import cjwbw_vqfr from './cjwbw-vqfr';
import codeplugtech_object_remover from './codeplugtech-object_remover';
import codeslake_ifan_defocus_deblur from './codeslake-ifan-defocus-deblur';
import comfyui_any_comfyui_workflow from './comfyui-any-comfyui-workflow';
import cswry_seesr from './cswry-seesr';
import cudanexus_ocr_surya from './cudanexus-ocr-surya';
import curt_park_sentiment_analysis from './curt-park-sentiment-analysis';
import cuuupid_glm_4v_9b from './cuuupid-glm-4v-9b';
import cuuupid_gte_qwen2_7b_instruct from './cuuupid-gte-qwen2-7b-instruct';
import cuuupid_marker from './cuuupid-marker';
import daanelson_imagebind from './daanelson-imagebind';
import daanelson_minigpt_4 from './daanelson-minigpt-4';
import daanelson_whisperx from './daanelson-whisperx';
import datacte_proteus_v0_2 from './datacte-proteus-v0-2';
import datacte_proteus_v0_3 from './datacte-proteus-v0-3';
import datalab_to_marker from './datalab-to-marker';
import datalab_to_ocr from './datalab-to-ocr';
import easel_advanced_face_swap from './easel-advanced-face-swap';
import easel_ai_avatars from './easel-ai-avatars';
import fermatresearch_high_resolution_controlnet_tile from './fermatresearch-high-resolution-controlnet-tile';
import fermatresearch_magic_image_refiner from './fermatresearch-magic-image-refiner';
import fermatresearch_magic_style_transfer from './fermatresearch-magic-style-transfer';
import fermatresearch_sdxl_controlnet_lora from './fermatresearch-sdxl-controlnet-lora';
import fermatresearch_spanish_f5_tts from './fermatresearch-spanish-f5-tts';
import fewjative_ultimate_sd_upscale from './fewjative-ultimate-sd-upscale';
import flux_kontext_apps_change_haircut from './flux-kontext-apps-change-haircut';
import flux_kontext_apps_multi_image_kontext_max from './flux-kontext-apps-multi-image-kontext-max';
import flux_kontext_apps_multi_image_kontext_pro from './flux-kontext-apps-multi-image-kontext-pro';
import flux_kontext_apps_multi_image_list from './flux-kontext-apps-multi-image-list';
import flux_kontext_apps_professional_headshot from './flux-kontext-apps-professional-headshot';
import flux_kontext_apps_restore_image from './flux-kontext-apps-restore-image';
import fofr_become_image from './fofr-become-image';
import fofr_color_matcher from './fofr-color-matcher';
import fofr_deprecated_batch_image_captioning from './fofr-deprecated-batch-image-captioning';
import fofr_face_swap_with_ideogram from './fofr-face-swap-with-ideogram';
import fofr_face_to_many from './fofr-face-to-many';
import fofr_face_to_sticker from './fofr-face-to-sticker';
import fofr_latent_consistency_model from './fofr-latent-consistency-model';
import fofr_prompt_classifier from './fofr-prompt-classifier';
import fofr_sdxl_emoji from './fofr-sdxl-emoji';
import fofr_sdxl_multi_controlnet_lora from './fofr-sdxl-multi-controlnet-lora';
import fofr_sticker_maker from './fofr-sticker-maker';
import georgedavila_bart_large_mnli_classifier from './georgedavila-bart-large-mnli-classifier';
import google_gemini_2_5_flash from './google-gemini-2-5-flash';
import google_gemini_3_pro from './google-gemini-3-pro';
import google_imagen_3_fast from './google-imagen-3-fast';
import google_imagen_3 from './google-imagen-3';
import google_imagen_4_fast from './google-imagen-4-fast';
import google_imagen_4_ultra from './google-imagen-4-ultra';
import google_imagen_4 from './google-imagen-4';
import google_lyria_2 from './google-lyria-2';
import google_nano_banana from './google-nano-banana';
import google_research_maxim from './google-research-maxim';
import google_upscaler from './google-upscaler';
import grandlineai_instant_id_artistic from './grandlineai-instant-id-artistic';
import grandlineai_instant_id_photorealistic from './grandlineai-instant-id-photorealistic';
import ibm_granite_granite_embedding_278m_multilingual from './ibm-granite-granite-embedding-278m-multilingual';
import ideogram_ai_ideogram_character from './ideogram-ai-ideogram-character';
import ideogram_ai_ideogram_v2_turbo from './ideogram-ai-ideogram-v2-turbo';
import ideogram_ai_ideogram_v2 from './ideogram-ai-ideogram-v2';
import ideogram_ai_ideogram_v2a_turbo from './ideogram-ai-ideogram-v2a-turbo';
import ideogram_ai_ideogram_v2a from './ideogram-ai-ideogram-v2a';
import ideogram_ai_ideogram_v3_balanced from './ideogram-ai-ideogram-v3-balanced';
import ideogram_ai_ideogram_v3_quality from './ideogram-ai-ideogram-v3-quality';
import ideogram_ai_ideogram_v3_turbo from './ideogram-ai-ideogram-v3-turbo';
import j_min_clip_caption_reward from './j-min-clip-caption-reward';
import jaaari_kokoro_82m from './jaaari-kokoro-82m';
import jagilley_controlnet_scribble from './jagilley-controlnet-scribble';
import jingyunliang_hcflow_sr from './jingyunliang-hcflow-sr';
import jingyunliang_swinir from './jingyunliang-swinir';
import joehoover_instructblip_vicuna13b from './joehoover-instructblip-vicuna13b';
import joehoover_mplug_owl from './joehoover-mplug-owl';
import juergengunz_ultimate_portrait_upscale from './juergengunz-ultimate-portrait-upscale';
import krthr_clip_embeddings from './krthr-clip-embeddings';
import kshitijagrwl_pii_extractor_llm from './kshitijagrwl-pii-extractor-llm';
import leonardoai_lucid_origin from './leonardoai-lucid-origin';
import lucataco_ace_step from './lucataco-ace-step';
import lucataco_bakllava from './lucataco-bakllava';
import lucataco_codeformer from './lucataco-codeformer';
import lucataco_controlnet_tile from './lucataco-controlnet-tile';
import lucataco_csm_1b from './lucataco-csm-1b';
import lucataco_deepseek_ocr from './lucataco-deepseek-ocr';
import lucataco_demofusion_enhance from './lucataco-demofusion-enhance';
import lucataco_dreamshaper_xl_turbo from './lucataco-dreamshaper-xl-turbo';
import lucataco_florence_2_base from './lucataco-florence-2-base';
import lucataco_fuyu_8b from './lucataco-fuyu-8b';
import lucataco_gpt_oss_safeguard_20b from './lucataco-gpt-oss-safeguard-20b';
import lucataco_ip_adapter_faceid from './lucataco-ip-adapter-faceid';
import lucataco_ip_adapter_face_inpaint from './lucataco-ip_adapter-face-inpaint';
import lucataco_ip_adapter_sdxl_face from './lucataco-ip_adapter-sdxl-face';
import lucataco_llama_3_vision_alpha from './lucataco-llama-3-vision-alpha';
import lucataco_magnet from './lucataco-magnet';
import lucataco_modelscope_facefusion from './lucataco-modelscope-facefusion';
import lucataco_moondream2 from './lucataco-moondream2';
import lucataco_nomic_embed_text_v1 from './lucataco-nomic-embed-text-v1';
import lucataco_ollama_llama3_2_vision_11b from './lucataco-ollama-llama3-2-vision-11b';
import lucataco_ollama_llama3_2_vision_90b from './lucataco-ollama-llama3-2-vision-90b';
import lucataco_omnigen2 from './lucataco-omnigen2';
import lucataco_open_dalle_v1_1 from './lucataco-open-dalle-v1-1';
import lucataco_orpheus_3b_0_1_ft from './lucataco-orpheus-3b-0-1-ft';
import lucataco_pasd_magnify from './lucataco-pasd-magnify';
import lucataco_pheme from './lucataco-pheme';
import lucataco_qwen_vl_chat from './lucataco-qwen-vl-chat';
import lucataco_qwen2_5_omni_7b from './lucataco-qwen2-5-omni-7b';
import lucataco_qwen2_vl_7b_instruct from './lucataco-qwen2-vl-7b-instruct';
import lucataco_realistic_vision_v5_1 from './lucataco-realistic-vision-v5-1';
import lucataco_sdxl_clip_interrogator from './lucataco-sdxl-clip-interrogator';
import lucataco_smolvlm_instruct from './lucataco-smolvlm-instruct';
import lucataco_snowflake_arctic_embed_l from './lucataco-snowflake-arctic-embed-l';
import lucataco_ssd_1b from './lucataco-ssd-1b';
import lucataco_stable_diffusion_x4_upscaler from './lucataco-stable-diffusion-x4-upscaler';
import lucataco_xtts_v2 from './lucataco-xtts-v2';
import luma_photon_flash from './luma-photon-flash';
import luma_photon from './luma-photon';
import m1guelpf_whisper_subtitles from './m1guelpf-whisper-subtitles';
import mark3labs_embeddings_gte_base from './mark3labs-embeddings-gte-base';
import megvii_research_nafnet from './megvii-research-nafnet';
import meta_musicgen from './meta-musicgen';
import methexis_inc_img2prompt from './methexis-inc-img2prompt';
import mickeybeurskens_latex_ocr from './mickeybeurskens-latex-ocr';
import microsoft_bringing_old_photos_back_to_life from './microsoft-bringing-old-photos-back-to-life';
import minimax_image_01 from './minimax-image-01';
import minimax_music_01 from './minimax-music-01';
import minimax_music_1_5 from './minimax-music-1-5';
import minimax_speech_02_hd from './minimax-speech-02-hd';
import minimax_speech_02_turbo from './minimax-speech-02-turbo';
import minimax_voice_cloning from './minimax-voice-cloning';
import mv_lab_instructir from './mv-lab-instructir';
import mv_lab_swin2sr from './mv-lab-swin2sr';
import nateraw_bge_large_en_v1_5 from './nateraw-bge-large-en-v1-5';
import nateraw_jina_embeddings_v2_base_en from './nateraw-jina-embeddings-v2-base-en';
import nicknaskida_whisper_diarization from './nicknaskida-whisper-diarization';
import nightmareai_latent_sr from './nightmareai-latent-sr';
import nightmareai_real_esrgan from './nightmareai-real-esrgan';
import nohamoamary_image_captioning_with_visual_attention from './nohamoamary-image-captioning-with-visual-attention';
import nvidia_parakeet_rnnt_1_1b from './nvidia-parakeet-rnnt-1-1b';
import nvidia_sana_sprint_1_6b from './nvidia-sana-sprint-1-6b';
import nvidia_sana from './nvidia-sana';
import openai_gpt_4_1_mini from './openai-gpt-4-1-mini';
import openai_gpt_4o_mini_transcribe from './openai-gpt-4o-mini-transcribe';
import openai_gpt_4o_mini from './openai-gpt-4o-mini';
import openai_gpt_4o_transcribe from './openai-gpt-4o-transcribe';
import openai_gpt_4o from './openai-gpt-4o';
import openai_gpt_5 from './openai-gpt-5';
import openai_gpt_image_1 from './openai-gpt-image-1';
import openai_whisper from './openai-whisper';
import orpatashnik_styleclip from './orpatashnik-styleclip';
import pbevan1_llama_3_1_8b_ocr_correction from './pbevan1-llama-3-1-8b-ocr-correction';
import pharmapsychotic_clip_interrogator from './pharmapsychotic-clip-interrogator';
import philz1337x_clarity_upscaler from './philz1337x-clarity-upscaler';
import philz1337x_crystal_upscaler from './philz1337x-crystal-upscaler';
import piddnad_ddcolor from './piddnad-ddcolor';
import platform_kit_mars5_tts from './platform-kit-mars5-tts';
import playgroundai_playground_v2_5_1024px_aesthetic from './playgroundai-playground-v2-5-1024px-aesthetic';
import prunaai_flux_fast from './prunaai-flux-fast';
import prunaai_flux_kontext_fast from './prunaai-flux-kontext-fast';
import prunaai_hidream_l1_dev from './prunaai-hidream-l1-dev';
import prunaai_hidream_l1_fast from './prunaai-hidream-l1-fast';
import prunaai_hidream_l1_full from './prunaai-hidream-l1-full';
import prunaai_sdxl_lightning from './prunaai-sdxl-lightning';
import prunaai_wan_2_2_image from './prunaai-wan-2-2-image';
import qwen_qwen_image_edit_plus from './qwen-qwen-image-edit-plus';
import qwen_qwen_image_edit from './qwen-qwen-image-edit';
import qwen_qwen_image from './qwen-qwen-image';
import recraft_ai_recraft_creative_upscale from './recraft-ai-recraft-creative-upscale';
import recraft_ai_recraft_crisp_upscale from './recraft-ai-recraft-crisp-upscale';
import recraft_ai_recraft_v3_svg from './recraft-ai-recraft-v3-svg';
import recraft_ai_recraft_v3 from './recraft-ai-recraft-v3';
import replicate_all_mpnet_base_v2 from './replicate-all-mpnet-base-v2';
import resemble_ai_chatterbox_multilingual from './resemble-ai-chatterbox-multilingual';
import resemble_ai_chatterbox_pro from './resemble-ai-chatterbox-pro';
import resemble_ai_chatterbox from './resemble-ai-chatterbox';
import riffusion_riffusion from './riffusion-riffusion';
import rmokady_clip_prefix_caption from './rmokady-clip_prefix_caption';
import runwayml_gen4_image_turbo from './runwayml-gen4-image-turbo';
import runwayml_gen4_image from './runwayml-gen4-image';
import sakemin_musicgen_chord from './sakemin-musicgen-chord';
import sakemin_musicgen_remixer from './sakemin-musicgen-remixer';
import sakemin_musicgen_stereo_chord from './sakemin-musicgen-stereo-chord';
import salesforce_blip from './salesforce-blip';
import sczhou_codeformer from './sczhou-codeformer';
import sdxl_based_realvisxl_v3_multi_controlnet_lora from './sdxl-based-realvisxl-v3-multi-controlnet-lora';
import stability_ai_sdxl from './stability-ai-sdxl';
import stability_ai_stable_audio_2_5 from './stability-ai-stable-audio-2-5';
import stability_ai_stable_diffusion_3_5_large_turbo from './stability-ai-stable-diffusion-3-5-large-turbo';
import stability_ai_stable_diffusion_3_5_large from './stability-ai-stable-diffusion-3-5-large';
import stability_ai_stable_diffusion_3_5_medium from './stability-ai-stable-diffusion-3-5-medium';
import stability_ai_stable_diffusion from './stability-ai-stable-diffusion';
import suno_ai_bark from './suno-ai-bark';
import tencent_hunyuan_image_3 from './tencent-hunyuan-image-3';
import tencentarc_gfpgan from './tencentarc-gfpgan';
import tencentarc_photomaker_style from './tencentarc-photomaker-style';
import tencentarc_photomaker from './tencentarc-photomaker';
import tencentarc_vqfr from './tencentarc-vqfr';
import thomasmol_whisper_diarization from './thomasmol-whisper-diarization';
import topazlabs_image_upscale from './topazlabs-image-upscale';
import tstramer_material_diffusion from './tstramer-material-diffusion';
import vaibhavs10_incredibly_fast_whisper from './vaibhavs10-incredibly-fast-whisper';
import victor_upmeet_whisperx from './victor-upmeet-whisperx';
import willywongi_donut from './willywongi-donut';
import x_lance_f5_tts from './x-lance-f5-tts';
import xai_grok_4 from './xai-grok-4';
import xinntao_esrgan from './xinntao-esrgan';
import yangxy_gpen from './yangxy-gpen';
import yorickvp_llava_13b from './yorickvp-llava-13b';
import yorickvp_llava_v1_6_34b from './yorickvp-llava-v1-6-34b';
import yorickvp_llava_v1_6_mistral_7b from './yorickvp-llava-v1-6-mistral-7b';
import yorickvp_llava_v1_6_vicuna_13b from './yorickvp-llava-v1-6-vicuna-13b';
import zsxkib_aura_sr_v2 from './zsxkib-aura-sr-v2';
import zsxkib_aura_sr from './zsxkib-aura-sr';
import zsxkib_blip_3 from './zsxkib-blip-3';
import zsxkib_bsrgan from './zsxkib-bsrgan';
import zsxkib_dia from './zsxkib-dia';
import zsxkib_diffbir from './zsxkib-diffbir';
import zsxkib_flash_face from './zsxkib-flash-face';
import zsxkib_flux_music from './zsxkib-flux-music';
import zsxkib_idefics3 from './zsxkib-idefics3';
import zsxkib_instant_id from './zsxkib-instant-id';
import zsxkib_jina_clip_v2 from './zsxkib-jina-clip-v2';
import zsxkib_molmo_7b from './zsxkib-molmo-7b';
import zsxkib_realistic_voice_cloning from './zsxkib-realistic-voice-cloning';
import zsxkib_seedvr2 from './zsxkib-seedvr2';
import zsxkib_step1x_edit from './zsxkib-step1x-edit';
import zsxkib_uform_gen from './zsxkib-uform-gen';
import zsyoaoa_invsr from './zsyoaoa-invsr';

export const replicateTransformers: Record<string, ReplicateTransformer> = {
  ...abiruyt_text_extract_ocr,
  ...adidoes_whisperx_video_transcribe,
  ...adirik_e5_mistral_7b_instruct,
  ...adirik_kosmos_g,
  ...adirik_owlvit_base_patch32,
  ...adirik_realvisxl_v3_0_turbo,
  ...adirik_styletts2,
  ...adirik_udop_large,
  ...afiaka87_tortoise_tts,
  ...ai_forever_kandinsky_2_2,
  ...ai_forever_kandinsky_2,
  ...alexgenovese_upscaler,
  ...andreasjansson_blip_2,
  ...andreasjansson_clip_features,
  ...andreasjansson_llama_2_13b_embeddings,
  ...andreasjansson_musicgen_looper,
  ...anthropic_claude_3_5_sonnet,
  ...anthropic_claude_3_7_sonnet,
  ...anthropic_claude_4_sonnet,
  ...arielreplicate_deoldify_image,
  ...awerks_neon_tts,
  ...awilliamson10_meta_nougat,
  ...beautyyuyanli_multilingual_e5_large,
  ...black_forest_labs_flux_1_1_pro_ultra,
  ...black_forest_labs_flux_1_1_pro,
  ...black_forest_labs_flux_2_dev,
  ...black_forest_labs_flux_2_flex,
  ...black_forest_labs_flux_2_pro,
  ...black_forest_labs_flux_canny_dev,
  ...black_forest_labs_flux_canny_pro,
  ...black_forest_labs_flux_depth_dev,
  ...black_forest_labs_flux_depth_pro,
  ...black_forest_labs_flux_dev_lora,
  ...black_forest_labs_flux_dev,
  ...black_forest_labs_flux_fill_dev,
  ...black_forest_labs_flux_fill_pro,
  ...black_forest_labs_flux_kontext_dev,
  ...black_forest_labs_flux_kontext_max,
  ...black_forest_labs_flux_kontext_pro,
  ...black_forest_labs_flux_pro_finetuned,
  ...black_forest_labs_flux_pro_trainer,
  ...black_forest_labs_flux_pro,
  ...black_forest_labs_flux_redux_dev,
  ...black_forest_labs_flux_redux_schnell,
  ...black_forest_labs_flux_schnell,
  ...bria_eraser,
  ...bria_expand_image,
  ...bria_fibo,
  ...bria_generate_background,
  ...bria_genfill,
  ...bria_image_3_2,
  ...bria_increase_resolution,
  ...bytedance_bagel,
  ...bytedance_dolphin,
  ...bytedance_flux_pulid,
  ...bytedance_pulid,
  ...bytedance_sdxl_lightning_4step,
  ...bytedance_seededit_3_0,
  ...bytedance_seedream_3,
  ...bytedance_seedream_4,
  ...camenduru_metavoice,
  ...center_for_curriculum_redesign_bge_1_5_query_embeddings,
  ...chenxwh_openvoice,
  ...chigozienri_mediapipe_face,
  ...cjwbw_bigcolor,
  ...cjwbw_canary_1b,
  ...cjwbw_cogvlm,
  ...cjwbw_docentr,
  ...cjwbw_face_align_cog,
  ...cjwbw_internlm_xcomposer,
  ...cjwbw_night_enhancement,
  ...cjwbw_parler_tts,
  ...cjwbw_real_esrgan,
  ...cjwbw_rudalle_sr,
  ...cjwbw_seamless_communication,
  ...cjwbw_supir_v0f,
  ...cjwbw_supir_v0q,
  ...cjwbw_supir,
  ...cjwbw_voicecraft,
  ...cjwbw_vqfr,
  ...codeplugtech_object_remover,
  ...codeslake_ifan_defocus_deblur,
  ...comfyui_any_comfyui_workflow,
  ...cswry_seesr,
  ...cudanexus_ocr_surya,
  ...curt_park_sentiment_analysis,
  ...cuuupid_glm_4v_9b,
  ...cuuupid_gte_qwen2_7b_instruct,
  ...cuuupid_marker,
  ...daanelson_imagebind,
  ...daanelson_minigpt_4,
  ...daanelson_whisperx,
  ...datacte_proteus_v0_2,
  ...datacte_proteus_v0_3,
  ...datalab_to_marker,
  ...datalab_to_ocr,
  ...easel_advanced_face_swap,
  ...easel_ai_avatars,
  ...fermatresearch_high_resolution_controlnet_tile,
  ...fermatresearch_magic_image_refiner,
  ...fermatresearch_magic_style_transfer,
  ...fermatresearch_sdxl_controlnet_lora,
  ...fermatresearch_spanish_f5_tts,
  ...fewjative_ultimate_sd_upscale,
  ...flux_kontext_apps_change_haircut,
  ...flux_kontext_apps_multi_image_kontext_max,
  ...flux_kontext_apps_multi_image_kontext_pro,
  ...flux_kontext_apps_multi_image_list,
  ...flux_kontext_apps_professional_headshot,
  ...flux_kontext_apps_restore_image,
  ...fofr_become_image,
  ...fofr_color_matcher,
  ...fofr_deprecated_batch_image_captioning,
  ...fofr_face_swap_with_ideogram,
  ...fofr_face_to_many,
  ...fofr_face_to_sticker,
  ...fofr_latent_consistency_model,
  ...fofr_prompt_classifier,
  ...fofr_sdxl_emoji,
  ...fofr_sdxl_multi_controlnet_lora,
  ...fofr_sticker_maker,
  ...georgedavila_bart_large_mnli_classifier,
  ...google_gemini_2_5_flash,
  ...google_gemini_3_pro,
  ...google_imagen_3_fast,
  ...google_imagen_3,
  ...google_imagen_4_fast,
  ...google_imagen_4_ultra,
  ...google_imagen_4,
  ...google_lyria_2,
  ...google_nano_banana,
  ...google_research_maxim,
  ...google_upscaler,
  ...grandlineai_instant_id_artistic,
  ...grandlineai_instant_id_photorealistic,
  ...ibm_granite_granite_embedding_278m_multilingual,
  ...ideogram_ai_ideogram_character,
  ...ideogram_ai_ideogram_v2_turbo,
  ...ideogram_ai_ideogram_v2,
  ...ideogram_ai_ideogram_v2a_turbo,
  ...ideogram_ai_ideogram_v2a,
  ...ideogram_ai_ideogram_v3_balanced,
  ...ideogram_ai_ideogram_v3_quality,
  ...ideogram_ai_ideogram_v3_turbo,
  ...j_min_clip_caption_reward,
  ...jaaari_kokoro_82m,
  ...jagilley_controlnet_scribble,
  ...jingyunliang_hcflow_sr,
  ...jingyunliang_swinir,
  ...joehoover_instructblip_vicuna13b,
  ...joehoover_mplug_owl,
  ...juergengunz_ultimate_portrait_upscale,
  ...krthr_clip_embeddings,
  ...kshitijagrwl_pii_extractor_llm,
  ...leonardoai_lucid_origin,
  ...lucataco_ace_step,
  ...lucataco_bakllava,
  ...lucataco_codeformer,
  ...lucataco_controlnet_tile,
  ...lucataco_csm_1b,
  ...lucataco_deepseek_ocr,
  ...lucataco_demofusion_enhance,
  ...lucataco_dreamshaper_xl_turbo,
  ...lucataco_florence_2_base,
  ...lucataco_fuyu_8b,
  ...lucataco_gpt_oss_safeguard_20b,
  ...lucataco_ip_adapter_faceid,
  ...lucataco_ip_adapter_face_inpaint,
  ...lucataco_ip_adapter_sdxl_face,
  ...lucataco_llama_3_vision_alpha,
  ...lucataco_magnet,
  ...lucataco_modelscope_facefusion,
  ...lucataco_moondream2,
  ...lucataco_nomic_embed_text_v1,
  ...lucataco_ollama_llama3_2_vision_11b,
  ...lucataco_ollama_llama3_2_vision_90b,
  ...lucataco_omnigen2,
  ...lucataco_open_dalle_v1_1,
  ...lucataco_orpheus_3b_0_1_ft,
  ...lucataco_pasd_magnify,
  ...lucataco_pheme,
  ...lucataco_qwen_vl_chat,
  ...lucataco_qwen2_5_omni_7b,
  ...lucataco_qwen2_vl_7b_instruct,
  ...lucataco_realistic_vision_v5_1,
  ...lucataco_sdxl_clip_interrogator,
  ...lucataco_smolvlm_instruct,
  ...lucataco_snowflake_arctic_embed_l,
  ...lucataco_ssd_1b,
  ...lucataco_stable_diffusion_x4_upscaler,
  ...lucataco_xtts_v2,
  ...luma_photon_flash,
  ...luma_photon,
  ...m1guelpf_whisper_subtitles,
  ...mark3labs_embeddings_gte_base,
  ...megvii_research_nafnet,
  ...meta_musicgen,
  ...methexis_inc_img2prompt,
  ...mickeybeurskens_latex_ocr,
  ...microsoft_bringing_old_photos_back_to_life,
  ...minimax_image_01,
  ...minimax_music_01,
  ...minimax_music_1_5,
  ...minimax_speech_02_hd,
  ...minimax_speech_02_turbo,
  ...minimax_voice_cloning,
  ...mv_lab_instructir,
  ...mv_lab_swin2sr,
  ...nateraw_bge_large_en_v1_5,
  ...nateraw_jina_embeddings_v2_base_en,
  ...nicknaskida_whisper_diarization,
  ...nightmareai_latent_sr,
  ...nightmareai_real_esrgan,
  ...nohamoamary_image_captioning_with_visual_attention,
  ...nvidia_parakeet_rnnt_1_1b,
  ...nvidia_sana_sprint_1_6b,
  ...nvidia_sana,
  ...openai_gpt_4_1_mini,
  ...openai_gpt_4o_mini_transcribe,
  ...openai_gpt_4o_mini,
  ...openai_gpt_4o_transcribe,
  ...openai_gpt_4o,
  ...openai_gpt_5,
  ...openai_gpt_image_1,
  ...openai_whisper,
  ...orpatashnik_styleclip,
  ...pbevan1_llama_3_1_8b_ocr_correction,
  ...pharmapsychotic_clip_interrogator,
  ...philz1337x_clarity_upscaler,
  ...philz1337x_crystal_upscaler,
  ...piddnad_ddcolor,
  ...platform_kit_mars5_tts,
  ...playgroundai_playground_v2_5_1024px_aesthetic,
  ...prunaai_flux_fast,
  ...prunaai_flux_kontext_fast,
  ...prunaai_hidream_l1_dev,
  ...prunaai_hidream_l1_fast,
  ...prunaai_hidream_l1_full,
  ...prunaai_sdxl_lightning,
  ...prunaai_wan_2_2_image,
  ...qwen_qwen_image_edit_plus,
  ...qwen_qwen_image_edit,
  ...qwen_qwen_image,
  ...recraft_ai_recraft_creative_upscale,
  ...recraft_ai_recraft_crisp_upscale,
  ...recraft_ai_recraft_v3_svg,
  ...recraft_ai_recraft_v3,
  ...replicate_all_mpnet_base_v2,
  ...resemble_ai_chatterbox_multilingual,
  ...resemble_ai_chatterbox_pro,
  ...resemble_ai_chatterbox,
  ...riffusion_riffusion,
  ...rmokady_clip_prefix_caption,
  ...runwayml_gen4_image_turbo,
  ...runwayml_gen4_image,
  ...sakemin_musicgen_chord,
  ...sakemin_musicgen_remixer,
  ...sakemin_musicgen_stereo_chord,
  ...salesforce_blip,
  ...sczhou_codeformer,
  ...sdxl_based_realvisxl_v3_multi_controlnet_lora,
  ...stability_ai_sdxl,
  ...stability_ai_stable_audio_2_5,
  ...stability_ai_stable_diffusion_3_5_large_turbo,
  ...stability_ai_stable_diffusion_3_5_large,
  ...stability_ai_stable_diffusion_3_5_medium,
  ...stability_ai_stable_diffusion,
  ...suno_ai_bark,
  ...tencent_hunyuan_image_3,
  ...tencentarc_gfpgan,
  ...tencentarc_photomaker_style,
  ...tencentarc_photomaker,
  ...tencentarc_vqfr,
  ...thomasmol_whisper_diarization,
  ...topazlabs_image_upscale,
  ...tstramer_material_diffusion,
  ...vaibhavs10_incredibly_fast_whisper,
  ...victor_upmeet_whisperx,
  ...willywongi_donut,
  ...x_lance_f5_tts,
  ...xai_grok_4,
  ...xinntao_esrgan,
  ...yangxy_gpen,
  ...yorickvp_llava_13b,
  ...yorickvp_llava_v1_6_34b,
  ...yorickvp_llava_v1_6_mistral_7b,
  ...yorickvp_llava_v1_6_vicuna_13b,
  ...zsxkib_aura_sr_v2,
  ...zsxkib_aura_sr,
  ...zsxkib_blip_3,
  ...zsxkib_bsrgan,
  ...zsxkib_dia,
  ...zsxkib_diffbir,
  ...zsxkib_flash_face,
  ...zsxkib_flux_music,
  ...zsxkib_idefics3,
  ...zsxkib_instant_id,
  ...zsxkib_jina_clip_v2,
  ...zsxkib_molmo_7b,
  ...zsxkib_realistic_voice_cloning,
  ...zsxkib_seedvr2,
  ...zsxkib_step1x_edit,
  ...zsxkib_uform_gen,
  ...zsyoaoa_invsr,
};