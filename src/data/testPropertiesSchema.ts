import type { JSONSchema } from '../components/SchemaForm';

/**
 * Relation properties form — mirrors GC2's Globals::$metaConfig
 * (geocloud2/app/inc/Globals.php) field for field; keep the two in sync.
 * Fieldsets map to `group`, combo/checkboxgroup name/value pairs to
 * `enumNames`/`enum`, and checkboxgroup values are stored comma-separated.
 */
export const testPropertiesSchema: JSONSchema = {
  type: 'object',
  properties: {
    meta_desc: {
      type: 'string',
      title: 'Description',
      format: 'textarea',
      group: 'CKAN',
    },
    short_conflict_meta_desc: {
      type: 'string',
      title: 'Short description',
      group: 'Konflikt',
    },
    long_conflict_meta_desc: {
      type: 'string',
      title: 'Long description',
      format: 'textarea',
      group: 'Konflikt',
    },
    buffer_conflict: {
      type: 'string',
      title: 'Buffer',
      group: 'Konflikt',
    },
    sql_conflict: {
      type: 'string',
      title: 'Analyse',
      format: 'textarea',
      group: 'Konflikt',
    },
    sql_conflict_header: {
      type: 'string',
      title: 'Analyse header',
      group: 'Konflikt',
    },
    info_template: {
      type: 'string',
      title: 'Pop-up template',
      format: 'textarea',
      group: 'Info pop-up',
    },
    info_element_selector: {
      type: 'string',
      title: 'Element selector',
      group: 'Info pop-up',
    },
    info_function: {
      type: 'string',
      title: 'Function',
      format: 'textarea',
      group: 'Info pop-up',
    },
    select_function: {
      type: 'string',
      title: 'Select function',
      format: 'textarea',
      group: 'Info pop-up',
    },
    accordion_summery_prefix: {
      type: 'string',
      title: 'Accordion summery prefix',
      group: 'Info pop-up',
    },
    accordion_summery: {
      type: 'string',
      title: 'Accordion summery',
      group: 'Info pop-up',
    },
    vidi_layer_type: {
      type: 'string',
      title: 'Type',
      format: 'checkboxgroup',
      enum: ['t', 'v', 'w', 'mvt'],
      enumNames: ['Tile', 'Vector', 'WebGL', 'MVT'],
      default: 't',
      group: 'Layer type',
    },
    default_layer_type: {
      type: 'string',
      title: 'Default',
      enum: ['t', 'v', 'w', 'mvt'],
      enumNames: ['Tile', 'Vector', 'WebGL', 'MVT'],
      default: 't',
      group: 'Layer type',
    },
    zoom_on_table_click: {
      type: 'boolean',
      title: 'Zoom on select',
      default: false,
      group: 'Tables',
    },
    max_zoom_level_table_click: {
      type: 'string',
      title: 'Max zoom level',
      default: '17',
      group: 'Tables',
    },
    vidi_layer_editable: {
      type: 'boolean',
      title: 'Editable',
      default: false,
      group: 'Editor',
    },
    single_tile: {
      type: 'boolean',
      title: 'Use tile cache',
      default: false,
      group: 'Tile settings',
    },
    tiles_service_uri: {
      type: 'string',
      title: 'Tiles service uri',
      group: 'Tile settings',
    },
    tiles_selected_style: {
      type: 'string',
      title: 'Selected style',
      format: 'textarea',
      group: 'Tile settings',
    },
    tiled: {
      type: 'boolean',
      title: 'Tiled',
      default: false,
      group: 'Tile settings',
    },
    load_strategy: {
      type: 'string',
      title: 'Load strategy',
      enum: ['s', 'd'],
      enumNames: ['Static', 'Dynamic'],
      default: 's',
      group: 'Vector settings',
    },
    max_features: {
      type: 'string',
      title: 'Max features',
      default: '500',
      group: 'Vector settings',
    },
    use_clustering: {
      type: 'boolean',
      title: 'Use clustering',
      default: false,
      group: 'Vector settings',
    },
    point_to_layer: {
      type: 'string',
      title: 'Point to layer',
      format: 'textarea',
      group: 'Vector settings',
    },
    vector_style: {
      type: 'string',
      title: 'Style function',
      format: 'textarea',
      group: 'Vector settings',
    },
    show_table_on_side: {
      type: 'boolean',
      title: 'Show table',
      default: false,
      group: 'Vector settings',
    },
    reload_interval: {
      type: 'string',
      title: 'Reload Interval',
      group: 'Vector settings',
    },
    reload_callback: {
      type: 'string',
      title: 'Reload callback',
      format: 'textarea',
      group: 'Vector settings',
    },
    disable_vector_feature_info: {
      type: 'boolean',
      title: 'Disable feature info',
      default: false,
      group: 'Vector settings',
    },
    vector_max_zoom: {
      type: 'string',
      title: 'Max zoom',
      group: 'Vector settings',
    },
    vector_min_zoom: {
      type: 'string',
      title: 'Min zoom',
      group: 'Vector settings',
    },
    tooltip_template: {
      type: 'string',
      title: 'Tooltip template',
      format: 'textarea',
      group: 'Vector settings',
    },
    line_highlight_style: {
      type: 'string',
      title: 'Line highlight style',
      format: 'textarea',
      group: 'Vector settings',
    },
    filter_config: {
      type: 'string',
      title: 'Filter config',
      format: 'textarea',
      group: 'Filters',
    },
    predefined_filters: {
      type: 'string',
      title: 'Predefined filters',
      format: 'textarea',
      group: 'Filters',
    },
    default_match: {
      type: 'string',
      title: 'Default match',
      enum: ['all', 'any'],
      enumNames: ['All', 'Any'],
      default: 'any',
      group: 'Filters',
    },
    filter_immutable: {
      type: 'boolean',
      title: 'Immutable',
      default: false,
      group: 'Filters',
    },
    filter_html_template: {
      type: 'string',
      title: 'HTML template',
      format: 'textarea',
      group: 'Filters',
    },
    filter_required: {
      type: 'boolean',
      title: 'Required',
      group: 'Filters',
    },
    hover_active: {
      type: 'boolean',
      title: 'Activate mouse over',
      group: 'Mouse over',
    },
    info_template_hover: {
      type: 'string',
      title: 'Template',
      format: 'textarea',
      group: 'Mouse over',
    },
    cache_utf_grid: {
      type: 'boolean',
      title: 'Cache UTF grid',
      group: 'Mouse over',
    },
    referenced_by: {
      type: 'string',
      title: 'Referenced by',
      format: 'textarea',
      group: 'References',
    },
    vidi_sub_group: {
      type: 'string',
      title: 'Sub group',
      group: 'Layer tree',
    },
    default_open_tools: {
      type: 'string',
      title: 'Open tools',
      format: 'textarea',
      group: 'Layer tree',
    },
    disable_check_box: {
      type: 'boolean',
      title: 'Disable check box',
      default: false,
      group: 'Layer tree',
    },
  },
};
