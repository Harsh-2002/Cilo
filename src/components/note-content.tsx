import { Fragment, type ReactNode } from "react";
import { Check } from "lucide-react";
import { MediaPlayer } from "./media-player";
import { ReaderCode, ReaderDiagram } from "./reader-artifacts";
import { readerText, readerUrl } from "@/lib/reader";
import { mediaUrl } from "@/lib/media-url";
import { readerStyle } from "@/lib/reader-styles";

type Block = Record<string, unknown>;
function inline(value: unknown): ReactNode {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  return value.map((item: Block, index) => {
    if (!item || typeof item !== "object") return null;
    if (item.type === "link") {
      const href = readerUrl(item.href);
      return href ? (
        <a
          key={index}
          href={href}
          rel="noopener noreferrer nofollow"
          target={href.startsWith("#") ? undefined : "_blank"}
        >
          {inline(item.content)}
        </a>
      ) : (
        <Fragment key={index}>{inline(item.content)}</Fragment>
      );
    }
    let content: ReactNode =
      typeof item.text === "string" ? item.text : readerText(item.content);
    const styles = (item.styles || {}) as Block;
    if (styles.code) content = <code>{content}</code>;
    if (styles.bold) content = <strong>{content}</strong>;
    if (styles.italic) content = <em>{content}</em>;
    if (styles.underline) content = <u>{content}</u>;
    if (styles.strike) content = <s>{content}</s>;
    return (
      <span key={index} className={readerStyle(styles).name}>
        {content}
      </span>
    );
  });
}
function renderBlock(block: Block, key: number): ReactNode {
  const props = (block.props || {}) as Block;
  const content = inline(block.content);
  const children =
    Array.isArray(block.children) && block.children.length ? (
      <div className="reader-children">
        <NoteContent blocks={block.children as Block[]} />
      </div>
    ) : null;
  const className = readerStyle(props).name;
  switch (block.type) {
    case "heading": {
      const Heading = props.level === 3 ? "h3" : "h2";
      return (
        <section key={key} className={className}>
          <Heading>{content}</Heading>
          {children}
        </section>
      );
    }
    case "quote":
      return (
        <blockquote key={key} className={className}>
          {content}
          {children}
        </blockquote>
      );
    case "divider":
      return <hr key={key} />;
    case "codeBlock":
      return (
        <Fragment key={key}>
          <ReaderCode
            code={readerText(block.content)}
            language={
              typeof props.language === "string" ? props.language : "text"
            }
          />
          {children}
        </Fragment>
      );
    case "diagram":
      return (
        <Fragment key={key}>
          <ReaderDiagram source={readerText(block.content)} />
          {children}
        </Fragment>
      );
    case "canvas": {
      const value = readerUrl(props.preview, true);
      const src = value && mediaUrl(value);
      return (
        <figure key={key}>
          {src ? (
            <img
              src={src}
              alt="Drawing"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : (
            <p>Drawing preview unavailable.</p>
          )}
          {children}
        </figure>
      );
    }
    case "image":
    case "video":
    case "audio":
    case "file": {
      const value = readerUrl(props.url, true);
      const src = value && (block.type === "file" ? value : mediaUrl(value));
      const name = typeof props.name === "string" ? props.name : "Attachment";
      const caption = typeof props.caption === "string" ? props.caption : "";
      if (!src) return <p key={key}>{name}</p>;
      const media =
        block.type === "image" ? (
          <img
            src={src}
            alt={caption || name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : block.type === "video" ? (
          <MediaPlayer key={src} src={src} kind="video" name={name} />
        ) : block.type === "audio" ? (
          <MediaPlayer key={src} src={src} kind="audio" name={name} />
        ) : (
          <a href={src} download rel="noopener noreferrer">
            {name}
          </a>
        );
      return (
        <figure key={key}>
          {media}
          {caption && <figcaption>{caption}</figcaption>}
          {children}
        </figure>
      );
    }
    case "table": {
      const table = block.content as
        { rows?: { cells?: unknown[] }[]; headerRows?: number } | undefined;
      return (
        <div className="reader-table" key={key}>
          <table>
            <tbody>
              {(Array.isArray(table?.rows) ? table.rows : []).map(
                (row, index) => (
                  <tr key={index}>
                    {(Array.isArray(row?.cells) ? row.cells : []).map(
                      (cell, cellIndex) => {
                        const Cell =
                          index < (table?.headerRows || 0) ? "th" : "td";
                        const value =
                          cell &&
                          typeof cell === "object" &&
                          !Array.isArray(cell)
                            ? (cell as Block).content
                            : cell;
                        return <Cell key={cellIndex}>{inline(value)}</Cell>;
                      },
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
          {children}
        </div>
      );
    }
    case "checkListItem":
      return (
        <div className="reader-check" key={key}>
          <span
            className="reader-check-mark"
            role="img"
            aria-label={props.checked ? "Completed" : "Incomplete"}
          >
            {Boolean(props.checked) && <Check size={12} />}
          </span>
          <div>
            {content}
            {children}
          </div>
        </div>
      );
    case "toggleListItem":
      return (
        <details key={key}>
          <summary>{content}</summary>
          {children}
        </details>
      );
    default:
      return (
        <div key={key} className={className}>
          <p>{content || <br />}</p>
          {children}
        </div>
      );
  }
}
export function NoteContent({ blocks }: { blocks: Block[] }) {
  const output: ReactNode[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.type === "bulletListItem" || block.type === "numberedListItem") {
      const items = [];
      const start = index;
      const List = block.type === "numberedListItem" ? "ol" : "ul";
      do {
        const item = blocks[index];
        items.push(
          <li key={index}>
            {inline(item.content)}
            {Array.isArray(item.children) && (
              <NoteContent blocks={item.children as Block[]} />
            )}
          </li>,
        );
        index++;
      } while (index < blocks.length && blocks[index].type === block.type);
      index--;
      output.push(<List key={start}>{items}</List>);
    } else output.push(renderBlock(block, index));
  }
  return <div className="reader-content">{output}</div>;
}
