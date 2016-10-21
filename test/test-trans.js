const {schema, doc, blockquote, pre, h1, h2, p, li, ol, ul, em,
       strong, code, a, a2, img, img2, dataImage, br, hr} = require("prosemirror-model/test/build")
const {testTransform} = require("./trans")
const {Transform, liftTarget, findWrapping} = require("../dist")
const {Slice} = require("prosemirror-model")
const ist = require("ist")

describe("Transform", () => {
  describe("addMark", () => {
    function add(doc, mark, expect) {
      testTransform(new Transform(doc).addMark(doc.tag.a, doc.tag.b, mark), expect)
    }

    it("should add a mark", () =>
       add(doc(p("hello <a>there<b>!")),
           schema.mark("strong"),
           doc(p("hello ", strong("there"), "!"))))

    it("should only add a mark once", () =>
       add(doc(p("hello ", strong("<a>there"), "!<b>")),
           schema.mark("strong"),
           doc(p("hello ", strong("there!")))))

    it("should join overlapping marks", () =>
       add(doc(p("one <a>two ", em("three<b> four"))),
           schema.mark("strong"),
           doc(p("one ", strong("two ", em("three")), em(" four")))))

    it("should overwrite marks with different attributes", () =>
       add(doc(p("this is a ", a("<a>link<b>"))),
           schema.mark("link", {href: "http://bar"}),
           doc(p("this is a ", a2("link")))))

    it("can add a mark in a nested node", () =>
       add(doc(p("before"), blockquote(p("the variable is called <a>i<b>")), p("after")),
           schema.mark("code"),
           doc(p("before"), blockquote(p("the variable is called ", code("i"))), p("after"))))

    it("can add a mark across blocks", () =>
       add(doc(p("hi <a>this"), blockquote(p("is")), p("a docu<b>ment"), p("!")),
           schema.mark("em"),
           doc(p("hi ", em("this")), blockquote(p(em("is"))), p(em("a docu"), "ment"), p("!"))))
  })

  describe("removeMark", () => {
    function rem(doc, mark, expect) {
      testTransform(new Transform(doc).removeMark(doc.tag.a, doc.tag.b, mark), expect)
    }

    it("can cut a gap", () =>
       rem(doc(p(em("hello <a>world<b>!"))),
           schema.mark("em"),
           doc(p(em("hello "), "world", em("!")))))

    it("doesn't do anything when there's no mark", () =>
       rem(doc(p(em("hello"), " <a>world<b>!")),
           schema.mark("em"),
           doc(p(em("hello"), " <a>world<b>!"))))

    it("can remove marks from nested nodes", () =>
       rem(doc(p(em("one ", strong("<a>two<b>"), " three"))),
           schema.mark("strong"),
           doc(p(em("one two three")))))

    it("can remove a link", () =>
       rem(doc(p("<a>hello ", a("link<b>"))),
           schema.mark("link", {href: "http://foo"}),
           doc(p("hello link"))))

    it("doesn't remove a non-matching link", () =>
       rem(doc(p("hello ", a("link"))),
           schema.mark("link", {href: "http://bar"}),
           doc(p("hello ", a("link")))))

    it("can remove across blocks", () =>
       rem(doc(blockquote(p(em("much <a>em")), p(em("here too"))), p("between", em("...")), p(em("end<b>"))),
           schema.mark("em"),
           doc(blockquote(p(em("much "), "em"), p("here too")), p("between..."), p("end"))))

    it("can remove everything", () =>
       rem(doc(p("<a>hello, ", em("this is ", strong("much"), " ", a("markup<b>")))),
           null,
           doc(p("<a>hello, this is much markup"))))
  })

  describe("insert", () => {
    function ins(doc, nodes, expect) {
      testTransform(new Transform(doc).insert(doc.tag.a, nodes), expect)
    }

    it("can insert a break", () =>
       ins(doc(p("hello<a>there")),
           schema.node("hard_break"),
           doc(p("hello", br, "<a>there"))))

    it("can insert an empty paragraph at the top", () =>
       ins(doc(p("one"), "<a>", p("two<2>")),
           schema.node("paragraph"),
           doc(p("one"), p(), "<a>", p("two<2>"))))

    it("can insert two block nodes", () =>
       ins(doc(p("one"), "<a>", p("two<2>")),
           [schema.node("paragraph", null, [schema.text("hi")]),
            schema.node("horizontal_rule")],
           doc(p("one"), p("hi"), hr, "<a>", p("two<2>"))))

    it("can insert at the end of a blockquote", () =>
       ins(doc(blockquote(p("he<before>y"), "<a>"), p("after<after>")),
           schema.node("paragraph"),
           doc(blockquote(p("he<before>y"), p()), p("after<after>"))))

    it("can insert at the start of a blockquote", () =>
       ins(doc(blockquote("<a>", p("he<1>y")), p("after<2>")),
           schema.node("paragraph"),
           doc(blockquote(p(), "<a>", p("he<1>y")), p("after<2>"))))
  })

  describe("delete", () => {
    function del(doc, expect) {
      testTransform(new Transform(doc).delete(doc.tag.a, doc.tag.b), expect)
    }

    it("can delete a word", () =>
       del(doc(p("<1>one"), "<a>", p("tw<2>o"), "<b>", p("<3>three")),
           doc(p("<1>one"), "<a><2>", p("<3>three"))))

    it("preserves content constraints", () =>
       del(doc(blockquote("<a>", p("hi"), "<b>"), p("x")),
           doc(blockquote(p()), p("x"))))

    it("preserves positions after the range", () =>
       del(doc(blockquote(p("a"), "<a>", p("b"), "<b>"), p("c<1>")),
           doc(blockquote(p("a")), p("c<1>"))))

    it("doesn't join incompatible nodes", () =>
       del(doc(pre("fo<a>o"), p("b<b>ar", img)),
           doc(pre("fo"), p("ar", img))))
  })

  describe("join", () => {
    function join(doc, expect) {
      testTransform(new Transform(doc).join(doc.tag.a), expect)
    }

    it("can join blocks", () =>
       join(doc(blockquote(p("<before>a")), "<a>", blockquote(p("b")), p("after<after>")),
            doc(blockquote(p("<before>a"), "<a>", p("b")), p("after<after>"))))

    it("can join compatible blocks", () =>
       join(doc(h1("foo"), "<a>", p("bar")),
            doc(h1("foobar"))))

    it("can join nested blocks", () =>
       join(doc(blockquote(blockquote(p("a"), p("b<before>")), "<a>", blockquote(p("c"), p("d<after>")))),
            doc(blockquote(blockquote(p("a"), p("b<before>"), "<a>", p("c"), p("d<after>"))))))

    it("can join lists", () =>
       join(doc(ol(li(p("one")), li(p("two"))), "<a>", ol(li(p("three")))),
            doc(ol(li(p("one")), li(p("two")), "<a>", li(p("three"))))))

    it("can join list items", () =>
       join(doc(ol(li(p("one")), li(p("two")), "<a>", li(p("three")))),
            doc(ol(li(p("one")), li(p("two"), "<a>", p("three"))))))

    it("can join textblocks", () =>
       join(doc(p("foo"), "<a>", p("bar")),
            doc(p("foo<a>bar"))))
  })

  describe("split", () => {
    function split(doc, expect, ...args) {
      if (expect == "fail")
        ist.throws(() => new Transform(doc).split(doc.tag.a, ...args))
      else
        testTransform(new Transform(doc).split(doc.tag.a, ...args), expect)
    }

    it("can split a textblock", () =>
       split(doc(p("foo<a>bar")),
             doc(p("foo"), p("<a>bar"))))

    it("correctly maps positions", () =>
       split(doc(p("<1>a"), p("<2>foo<a>bar<3>"), p("<4>b")),
             doc(p("<1>a"), p("<2>foo"), p("<a>bar<3>"), p("<4>b"))))

    it("can split two deep", () =>
       split(doc(blockquote(blockquote(p("foo<a>bar"))), p("after<1>")),
             doc(blockquote(blockquote(p("foo")), blockquote(p("<a>bar"))), p("after<1>")),
             2))

    it("can split three deep", () =>
       split(doc(blockquote(blockquote(p("foo<a>bar"))), p("after<1>")),
             doc(blockquote(blockquote(p("foo"))), blockquote(blockquote(p("<a>bar"))), p("after<1>")),
             3))

    it("can split at end", () =>
       split(doc(blockquote(p("hi<a>"))),
             doc(blockquote(p("hi"), p("<a>")))))

    it("can split at start", () =>
       split(doc(blockquote(p("<a>hi"))),
             doc(blockquote(p(), p("<a>hi")))))

    it("can split inside a list item", () =>
       split(doc(ol(li(p("one<1>")), li(p("two<a>three")), li(p("four<2>")))),
             doc(ol(li(p("one<1>")), li(p("two"), p("<a>three")), li(p("four<2>"))))))

    it("can split a list item", () =>
       split(doc(ol(li(p("one<1>")), li(p("two<a>three")), li(p("four<2>")))),
             doc(ol(li(p("one<1>")), li(p("two")), li(p("<a>three")), li(p("four<2>")))),
             2))

    it("respects the type param", () =>
       split(doc(h1("hell<a>o!")),
             doc(h1("hell"), p("<a>o!")),
             undefined, [{type: schema.nodes.paragraph}]))

    it("preserves content constraints before", () =>
       split(doc(blockquote("<a>", p("x"))), "fail"))

    it("preserves content constraints after", () =>
       split(doc(blockquote(p("x"), "<a>")), "fail"))
  })

  describe("lift", () => {
    function lift(doc, expect) {
      let range = doc.resolve(doc.tag.a).blockRange(doc.resolve(doc.tag.b || doc.tag.a))
      testTransform(new Transform(doc).lift(range, liftTarget(range)), expect)
    }

    it("can lift a block out of the middle of its parent", () =>
       lift(doc(blockquote(p("<before>one"), p("<a>two"), p("<after>three"))),
            doc(blockquote(p("<before>one")), p("<a>two"), blockquote(p("<after>three")))))

    it("can lift a block from the start of its parent", () =>
       lift(doc(blockquote(p("<a>two"), p("<after>three"))),
            doc(p("<a>two"), blockquote(p("<after>three")))))

    it("can lift a block from the end of its parent", () =>
       lift(doc(blockquote(p("<before>one"), p("<a>two"))),
            doc(blockquote(p("<before>one")), p("<a>two"))))

    it("can lift a single child", () =>
       lift(doc(blockquote(p("<a>t<in>wo"))),
            doc(p("<a>t<in>wo"))))

    it("can lift multiple blocks", () =>
       lift(doc(blockquote(blockquote(p("on<a>e"), p("tw<b>o")), p("three"))),
            doc(blockquote(p("on<a>e"), p("tw<b>o"), p("three")))))

    it("finds a valid range from a lopsided selection", () =>
       lift(doc(p("start"), blockquote(blockquote(p("a"), p("<a>b")), p("<b>c"))),
            doc(p("start"), blockquote(p("a"), p("<a>b")), p("<b>c"))))

    it("can lift from a nested node", () =>
       lift(doc(blockquote(blockquote(p("<1>one"), p("<a>two"), p("<3>three"), p("<b>four"), p("<5>five")))),
            doc(blockquote(blockquote(p("<1>one")), p("<a>two"), p("<3>three"), p("<b>four"), blockquote(p("<5>five"))))))

    it("can lift from a list", () =>
       lift(doc(ul(li(p("one")), li(p("two<a>")), li(p("three")))),
            doc(ul(li(p("one"))), p("two<a>"), ul(li(p("three"))))))

    it("can lift from the end of a list", () =>
       lift(doc(ul(li(p("a")), li(p("b<a>")), "<1>")),
            doc(ul(li(p("a"))), p("b<a>"), "<1>")))
  })

  describe("wrap", () => {
    function wrap(doc, expect, type, attrs) {
      let range = doc.resolve(doc.tag.a).blockRange(doc.resolve(doc.tag.b || doc.tag.a))
      testTransform(new Transform(doc).wrap(range, findWrapping(range, schema.nodes[type], attrs)), expect)
    }

    it("can wrap in a blockquote", () =>
       wrap(doc(p("one"), p("<a>two"), p("three")),
            doc(p("one"), blockquote(p("<a>two")), p("three")),
            "blockquote"))

    it("can wrap two paragraphs", () =>
       wrap(doc(p("one<1>"), p("<a>two"), p("<b>three"), p("four<4>")),
            doc(p("one<1>"), blockquote(p("<a>two"), p("three")), p("four<4>")),
            "blockquote"))

    it("can wrap in a list", () =>
       wrap(doc(p("<a>one"), p("<b>two")),
            doc(ol(li(p("<a>one"), p("<b>two")))),
            "ordered_list"))

    it("can wrap in a nested list", () =>
       wrap(doc(ol(li(p("<1>one")), li(p("..."), p("<a>two"), p("<b>three")), li(p("<4>four")))),
            doc(ol(li(p("<1>one")), li(p("..."), ol(li(p("<a>two"), p("<b>three")))), li(p("<4>four")))),
            "ordered_list"))

    it("includes half-covered parent nodes", () =>
       wrap(doc(blockquote(p("<1>one"), p("two<a>")), p("three<b>")),
            doc(blockquote(blockquote(p("<1>one"), p("two<a>")), p("three<b>"))),
            "blockquote"))
  })

  describe("setBlockType", () => {
    function type(doc, expect, nodeType, attrs) {
      testTransform(new Transform(doc).setBlockType(doc.tag.a, doc.tag.b || doc.tag.a, schema.nodes[nodeType], attrs),
                    expect)
    }

    it("can change a single textblock", () =>
       type(doc(p("am<a> i")),
            doc(h2("am i")),
            "heading", {level: 2}))

    it("can change multiple blocks", () =>
       type(doc(h1("<a>hello"), p("there"), p("<b>you"), p("end")),
            doc(pre("hello"), pre("there"), pre("you"), p("end")),
            "code_block"))

    it("can change a wrapped block", () =>
       type(doc(blockquote(p("one<a>"), p("two<b>"))),
            doc(blockquote(h1("one<a>"), h1("two<b>"))),
            "heading", {level: 1}))

    it("clears markup when necessary", () =>
       type(doc(p("hello<a> ", em("world"))),
            doc(pre("hello world")),
            "code_block"))

    it("only clears markup when needed", () =>
       type(doc(p("hello<a> ", em("world"))),
            doc(h1("hello<a> ", em("world"))),
            "heading", {level: 1}))
  })

  describe("setNodeType", () => {
    function type(doc, expect, type, attrs) {
      testTransform(new Transform(doc).setNodeType(doc.tag.a, schema.nodes[type], attrs), expect)
    }

    it("can change a textblock", () =>
       type(doc("<a>", p("foo")),
            doc(h1("foo")),
            "heading", {level: 1}))

    it("can change an inline node", () =>
       type(doc(p("foo<a>", img, "bar")),
            doc(p("foo", img2, "bar")),
            "image", {src: dataImage, alt: "y"}))
  })

  describe("replace", () => {
    function repl(doc, source, expect) {
      let slice = source ? source.slice(source.tag.a, source.tag.b) : Slice.empty
      testTransform(new Transform(doc).replace(doc.tag.a, doc.tag.b || doc.tag.a, slice), expect)
    }

    it("can delete text", () =>
       repl(doc(p("hell<a>o y<b>ou")),
            null,
            doc(p("hell<a><b>ou"))))

    it("can join blocks", () =>
       repl(doc(p("hell<a>o"), p("y<b>ou")),
            null,
            doc(p("hell<a><b>ou"))))

    it("can delete right-leaning lopsided regions", () =>
       repl(doc(blockquote(p("ab<a>c")), "<b>", p("def")),
            null,
            doc(blockquote(p("ab<a>")), "<b>", p("def"))))

    it("can delete left-leaning lopsided regions", () =>
       repl(doc(p("abc"), "<a>", blockquote(p("d<b>ef"))),
            null,
            doc(p("abc"), "<a>", blockquote(p("<b>ef")))))

    it("can overwrite text", () =>
       repl(doc(p("hell<a>o y<b>ou")),
            doc(p("<a>i k<b>")),
            doc(p("hell<a>i k<b>ou"))))

    it("can insert text", () =>
       repl(doc(p("hell<a><b>o")),
            doc(p("<a>i k<b>")),
            doc(p("helli k<a><b>o"))))

    it("can add a textblock", () =>
       repl(doc(p("hello<a>you")),
            doc("<a>", p("there"), "<b>"),
            doc(p("hello"), p("there"), p("<a>you"))))

    it("can insert while joining textblocks", () =>
       repl(doc(h1("he<a>llo"), p("arg<b>!")),
            doc(p("1<a>2<b>3")),
            doc(h1("he2!"))))

    it("will match open list items", () =>
       repl(doc(ol(li(p("one<a>")), li(p("three")))),
            doc(ol(li(p("<a>half")), li(p("two")), "<b>")),
            doc(ol(li(p("onehalf")), li(p("two")), li(p()), li(p("three"))))))

    it("merges blocks across deleted content", () =>
       repl(doc(p("a<a>"), p("b"), p("<b>c")),
            null,
            doc(p("a<a><b>c"))))

    it("can merge text down from nested nodes", () =>
       repl(doc(h1("wo<a>ah"), blockquote(p("ah<b>ha"))),
            null,
            doc(h1("wo<a><b>ha"))))

    it("can merge text up into nested nodes", () =>
       repl(doc(blockquote(p("foo<a>bar")), p("middle"), h1("quux<b>baz")),
            null,
            doc(blockquote(p("foo<a><b>baz")))))

    it("will join multiple levels when possible", () =>
       repl(doc(blockquote(ul(li(p("a")), li(p("b<a>")), li(p("c")), li(p("<b>d")), li(p("e"))))),
            null,
            doc(blockquote(ul(li(p("a")), li(p("b<a><b>d")), li(p("e")))))))

    it("can replace a piece of text", () =>
       repl(doc(p("he<before>llo<a> w<after>orld")),
            doc(p("<a> big<b>")),
            doc(p("he<before>llo big w<after>orld"))))

    it("respects open empty nodes at the edges", () =>
       repl(doc(p("one<a>two")),
            doc(p("a<a>"), p("hello"), p("<b>b")),
            doc(p("one"), p("hello"), p("<a>two"))))

    it("can completely overwrite a paragraph", () =>
       repl(doc(p("one<a>"), p("t<inside>wo"), p("<b>three<end>")),
            doc(p("a<a>"), p("TWO"), p("<b>b")),
            doc(p("one<a>"), p("TWO"), p("<inside>three<end>"))))

    it("joins marks", () =>
       repl(doc(p("foo ", em("bar<a>baz"), "<b> quux")),
            doc(p("foo ", em("xy<a>zzy"), " foo<b>")),
            doc(p("foo ", em("barzzy"), " foo quux"))))

    it("can replace text with a break", () =>
       repl(doc(p("foo<a>b<inside>b<b>bar")),
            doc(p("<a>", br, "<b>")),
            doc(p("foo", br, "<inside>bar"))))

    it("can join different blocks", () =>
       repl(doc(h1("hell<a>o"), p("by<b>e")),
            null,
            doc(h1("helle"))))

    it("can restore a list parent", () =>
       repl(doc(h1("hell<a>o"), "<b>"),
            doc(ol(li(p("on<a>e")), li(p("tw<b>o")))),
            doc(h1("helle"), ol(li(p("tw"))))))

    it("can restore a list parent and join text after it", () =>
       repl(doc(h1("hell<a>o"), p("yo<b>u")),
            doc(ol(li(p("on<a>e")), li(p("tw<b>o")))),
            doc(h1("helle"), ol(li(p("twu"))))))

    it("can insert into an empty block", () =>
       repl(doc(p("a"), p("<a>"), p("b")),
            doc(p("x<a>y<b>z")),
            doc(p("a"), p("y<a>"), p("b"))))

    it("doesn't change the nesting of blocks after the selection", () =>
       repl(doc(p("one<a>"), p("two"), p("three")),
            doc(p("outside<a>"), blockquote(p("inside<b>"))),
            doc(p("one"), blockquote(p("inside")), p("two"), p("three"))))

    it("can close a parent node", () =>
       repl(doc(blockquote(p("b<a>c"), p("d<b>e"), p("f"))),
            doc(blockquote(p("x<a>y")), p("after"), "<b>"),
            doc(blockquote(p("b<a>y")), p("after"), blockquote(p("<b>e"), p("f")))))

    it("accepts lopsided regions", () =>
       repl(doc(blockquote(p("b<a>c"), p("d<b>e"), p("f"))),
            doc(blockquote(p("x<a>y")), p("z<b>")),
            doc(blockquote(p("b<a>y")), p("z<b>e"), blockquote(p("f")))))

    it("can close nested parent nodes", () =>
       repl(doc(blockquote(blockquote(p("one"), p("tw<a>o"), p("t<b>hree<3>"), p("four<4>")))),
            doc(ol(li(p("hello<a>world")), li(p("bye"))), p("ne<b>xt")),
            doc(blockquote(blockquote(p("one"), p("tw<a>world")), ol(li(p("bye"))), p("ne<b>hree<3>"), blockquote(p("four<4>"))))))

    it("will close open nodes to the right", () =>
       repl(doc(p("x"), "<a>"),
            doc("<a>", ul(li(p("a")), li("<b>", p("b")))),
            doc(p("x"), ul(li(p("a")), li(p())), "<a>")))

    it("can delete the whole document", () =>
       repl(doc("<a>", h1("hi"), p("you"), "<b>"),
            null,
            doc(p())))

    it("preserves and empty parent to the left", () =>
       repl(doc(blockquote("<a>", p("hi")), p("b<b>x")),
            doc(p("<a>hi<b>")),
            doc(blockquote(p("hix")))))

    it("preserves an empty parent to the right", () =>
       repl(doc(p("x<a>hi"), blockquote(p("yy"), "<b>"), p("c")),
            doc(p("<a>hi<b>")),
            doc(p("xhi"), blockquote(p()), p("c"))))

    it("drops an empty node at the start of the slice", () =>
       repl(doc(p("<a>x")),
            doc(blockquote(p("hi"), "<a>"), p("b<b>")),
            doc(p(), p("bx"))))

    it("drops an empty node at the end of the slice", () =>
       repl(doc(p("<a>x")),
            doc(p("b<a>"), blockquote("<b>", p("hi"))),
            doc(p(), blockquote(p()), p("x"))))
  })
})