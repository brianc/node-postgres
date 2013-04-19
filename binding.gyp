{
  'targets': [
    {
      'target_name': 'binding',
      'conditions' : [
        ['OS=="win" and "<!@(cmd /C where /Q pg_config || echo n)"!="n"',
          {
            'sources': ['src/binding.cc'],
            'include_dirs': ['<!@(pg_config --includedir)'],
            'libraries' : ['libpq.lib'],
            'msvs_settings': {
              'VCLinkerTool' : {
                'AdditionalLibraryDirectories' : [
                  '<!@(pg_config --libdir)\\'
                ]
              },
            }
          }
        ],
        
        ['OS!="win"',
          {
            'sources': ['src/binding.cc'],
            'include_dirs': ['<!@(pg_config --includedir)'],
            'libraries' : ['-lpq -L<!@(pg_config --libdir)']
          }
        ]
      ]
    }
  ]
}
