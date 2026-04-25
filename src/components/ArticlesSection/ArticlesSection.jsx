import { useEffect, useState } from 'react';
import { supabase } from '../../services/authService.js';
import styles from './ArticlesSection.module.css';

export default function ArticlesSection() {
  const [articles, setArticles] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from('articles')
      .select('id, title, excerpt, image_url, article_url, author, published_at')
      .order('published_at', { ascending: false })
      .then(({ data }) => {
        setArticles(data ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Hidden until loaded and at least one article exists
  if (!loaded || articles.length === 0) return null;

  return (
    <section className={styles.section} id="articles">
      <div className={styles.inner}>
        <h2 className={styles.heading}>Featured Articles</h2>
        <p className={styles.subheading}>Tips and guides from our partners at BabyLoveGrowth</p>
        <div className={styles.grid}>
          {articles.map((article) => (
            <a
              key={article.id}
              href={article.article_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.card}
            >
              {article.image_url && (
                <div className={styles.imageWrap}>
                  <img
                    src={article.image_url}
                    alt={article.title}
                    className={styles.image}
                    loading="lazy"
                  />
                </div>
              )}
              <div className={styles.body}>
                <h3 className={styles.title}>{article.title}</h3>
                {article.excerpt && (
                  <p className={styles.excerpt}>{article.excerpt}</p>
                )}
                <div className={styles.meta}>
                  {article.author && <span className={styles.author}>{article.author}</span>}
                  {article.author && article.published_at && <span className={styles.dot}>·</span>}
                  {article.published_at && (
                    <span className={styles.date}>
                      {new Date(article.published_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <span className={styles.readMore}>Read more →</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
