// Player-written texts (a character's background, bonds, ...) shown with a little markdown:
// bold, italic, lists and line breaks. Everything else (headings, links, images, tables,
// raw HTML) is unwrapped to its plain text, so a text from another player can't bring
// links or pictures onto the page.
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'

const ALLOWED = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br']

export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 text-lg text-parchment/85 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-semibold [&_strong]:text-parchment [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:marker:text-candle">
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        allowedElements={ALLOWED}
        unwrapDisallowed
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
