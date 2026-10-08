UPDATE notes SET document=replace(document,'/api/'||char(99,105,108,111)||'/','/api/nivra/'),revision=revision+1 WHERE instr(document,'/api/'||char(99,105,108,111)||'/')>0;
UPDATE note_versions SET document=replace(document,'/api/'||char(99,105,108,111)||'/','/api/nivra/') WHERE instr(document,'/api/'||char(99,105,108,111)||'/')>0;
UPDATE publications SET document=replace(document,'/api/'||char(99,105,108,111)||'/','/api/nivra/') WHERE instr(document,'/api/'||char(99,105,108,111)||'/')>0;
