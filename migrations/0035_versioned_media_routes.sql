WITH RECURSIVE changes AS (
  SELECT source.id AS identity, row_number() OVER (PARTITION BY source.id ORDER BY tree.id) AS position,
    tree.fullkey AS json_path, replace(tree.value,'/api/nivra/','/api/v1/') AS value
  FROM notes source,json_tree(source.document) tree
  WHERE tree.type='text' AND tree.key IN ('url','preview','href','src')
    AND (tree.value LIKE '/api/nivra/%' OR tree.value LIKE coalesce((SELECT public_url FROM system_configuration WHERE id=1),'') || '/api/nivra/%')
), rewritten(identity,position,document) AS (
  SELECT id,0,document FROM notes WHERE id IN (SELECT identity FROM changes)
  UNION ALL
  SELECT previous.identity,next.position,json_set(previous.document,next.json_path,next.value)
  FROM rewritten previous JOIN changes next ON next.identity=previous.identity AND next.position=previous.position+1
)
UPDATE notes SET revision=revision+1,document=(SELECT document FROM rewritten WHERE identity=notes.id ORDER BY position DESC LIMIT 1)
WHERE id IN (SELECT identity FROM changes);

WITH RECURSIVE changes AS (
  SELECT source.id AS identity, row_number() OVER (PARTITION BY source.id ORDER BY tree.id) AS position,
    tree.fullkey AS json_path, replace(tree.value,'/api/nivra/','/api/v1/') AS value
  FROM note_versions source,json_tree(source.document) tree
  WHERE tree.type='text' AND tree.key IN ('url','preview','href','src')
    AND (tree.value LIKE '/api/nivra/%' OR tree.value LIKE coalesce((SELECT public_url FROM system_configuration WHERE id=1),'') || '/api/nivra/%')
), rewritten(identity,position,document) AS (
  SELECT id,0,document FROM note_versions WHERE id IN (SELECT identity FROM changes)
  UNION ALL
  SELECT previous.identity,next.position,json_set(previous.document,next.json_path,next.value)
  FROM rewritten previous JOIN changes next ON next.identity=previous.identity AND next.position=previous.position+1
)
UPDATE note_versions SET document=(SELECT document FROM rewritten WHERE identity=note_versions.id ORDER BY position DESC LIMIT 1)
WHERE id IN (SELECT identity FROM changes);

WITH RECURSIVE changes AS (
  SELECT source.token AS identity, row_number() OVER (PARTITION BY source.token ORDER BY tree.id) AS position,
    tree.fullkey AS json_path, replace(tree.value,'/api/nivra/','/api/v1/') AS value
  FROM publications source,json_tree(source.document) tree
  WHERE tree.type='text' AND tree.key IN ('url','preview','href','src')
    AND (tree.value LIKE '/api/nivra/%' OR tree.value LIKE coalesce((SELECT public_url FROM system_configuration WHERE id=1),'') || '/api/nivra/%')
), rewritten(identity,position,document) AS (
  SELECT token,0,document FROM publications WHERE token IN (SELECT identity FROM changes)
  UNION ALL
  SELECT previous.identity,next.position,json_set(previous.document,next.json_path,next.value)
  FROM rewritten previous JOIN changes next ON next.identity=previous.identity AND next.position=previous.position+1
)
UPDATE publications SET document=(SELECT document FROM rewritten WHERE identity=publications.token ORDER BY position DESC LIMIT 1)
WHERE token IN (SELECT identity FROM changes);

DELETE FROM publication_pages;
