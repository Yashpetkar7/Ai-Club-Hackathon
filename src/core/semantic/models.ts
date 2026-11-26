/** The meaning model. Shared by the worker and the page side so both always name the same files. */
export const MEANING_MODEL = 'Snowflake/snowflake-arctic-embed-xs';
/** Pinned, so the files we checked are the files that load. */
export const MEANING_REVISION = 'd8c86521100d3556476a063fc2342036d45c106f';
/** onnx/model_quantized.onnx is 22.97 MB on Hugging Face, plus a small tokenizer. */
export const MEANING_MB = 23;
/** The model card asks for this in front of a search query, and nothing in front of a passage. */
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
/** The file that tells us the model is already saved in this browser. */
export const MEANING_FILE = `https://huggingface.co/${MEANING_MODEL}/resolve/${MEANING_REVISION}/onnx/model_quantized.onnx`;
