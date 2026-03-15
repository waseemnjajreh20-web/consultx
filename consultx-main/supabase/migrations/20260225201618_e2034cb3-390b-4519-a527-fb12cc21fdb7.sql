
-- المرحلة 1: إنشاء جداول GraphRAG الجديدة (لا تؤثر على أي جداول موجودة)

-- جدول الكيانات (Nodes)
CREATE TABLE public.graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  sbc_source TEXT NOT NULL,
  page_range TEXT,
  chapter INT,
  keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- جدول العلاقات (Edges)
CREATE TABLE public.graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  target_id UUID REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  description TEXT,
  weight FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- جدول ملخصات المجتمعات
CREATE TABLE public.community_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level INT NOT NULL,
  community_id INT NOT NULL,
  summary TEXT NOT NULL,
  summary_ar TEXT,
  node_ids UUID[],
  sbc_sources TEXT[],
  topic_keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- جدول تتبع حالة الـ indexing
CREATE TABLE public.graph_indexing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL UNIQUE,
  sbc_source TEXT NOT NULL,
  page_range TEXT,
  status TEXT DEFAULT 'pending',
  nodes_extracted INT DEFAULT 0,
  edges_extracted INT DEFAULT 0,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل RLS
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_indexing_status ENABLE ROW LEVEL SECURITY;

-- سياسات القراءة للمستخدمين المصادق عليهم
CREATE POLICY "Authenticated users can read graph_nodes"
  ON public.graph_nodes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read graph_edges"
  ON public.graph_edges FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read community_summaries"
  ON public.community_summaries FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read graph_indexing_status"
  ON public.graph_indexing_status FOR SELECT
  TO authenticated USING (true);

-- فهارس للأداء
CREATE INDEX idx_graph_nodes_sbc_source ON public.graph_nodes(sbc_source);
CREATE INDEX idx_graph_nodes_chapter ON public.graph_nodes(chapter);
CREATE INDEX idx_graph_nodes_keywords ON public.graph_nodes USING GIN(keywords);
CREATE INDEX idx_graph_edges_source_id ON public.graph_edges(source_id);
CREATE INDEX idx_graph_edges_target_id ON public.graph_edges(target_id);
CREATE INDEX idx_community_summaries_level ON public.community_summaries(level);
CREATE INDEX idx_community_summaries_keywords ON public.community_summaries USING GIN(topic_keywords);
CREATE INDEX idx_graph_indexing_status_status ON public.graph_indexing_status(status);
