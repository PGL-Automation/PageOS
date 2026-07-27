// Package documents provides file storage and KYC document management.
// Actual bytes live in object storage; this package owns the interface,
// the metadata DB record, and the scan-status lifecycle.
package documents

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/ec2/imds"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ObjectStore abstracts file storage so the backing service is swappable
// (MinIO locally/staging → AWS S3 in prod) with zero code change.
type ObjectStore interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	// SignedURL returns a temporary pre-signed URL for direct browser download.
	SignedURL(ctx context.Context, key string, expires time.Duration) (string, error)
}

// S3Config holds the connection config for any S3-compatible store.
type S3Config struct {
	Endpoint        string // leave empty for real AWS S3
	Bucket          string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	ForcePathStyle  bool // true for MinIO
}

type s3Store struct {
	client *s3.Client
	psign  *s3.PresignClient
	bucket string
}

// NewS3Store returns an ObjectStore backed by any S3-compatible service.
func NewS3Store(ctx context.Context, cfg S3Config) (ObjectStore, error) {
	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		),
		// Disable EC2 IMDS lookup so startup is instant on non-AWS hosts
		// (MinIO local, Hostinger staging). On real AWS the SDK falls back to
		// role-based creds anyway since we supply static creds above.
		awsconfig.WithEC2IMDSClientEnableState(imds.ClientDisabled),
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("documents: load s3 config: %w", err)
	}

	clientOpts := []func(*s3.Options){
		func(o *s3.Options) { o.UsePathStyle = cfg.ForcePathStyle },
	}
	if cfg.Endpoint != "" {
		clientOpts = append(clientOpts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		})
	}

	client := s3.NewFromConfig(awsCfg, clientOpts...)
	store := &s3Store{
		client: client,
		psign:  s3.NewPresignClient(client),
		bucket: cfg.Bucket,
	}

	// Ensure the bucket exists. On MinIO (local/staging) it won't exist on
	// first boot; on real AWS S3 the bucket is pre-created by Terraform.
	// CreateBucket on an already-existing bucket is a no-op on MinIO and
	// returns BucketAlreadyOwnedByYou on AWS, which we treat as success.
	if err := store.ensureBucket(ctx, cfg.Bucket); err != nil {
		return nil, fmt.Errorf("documents: ensure bucket %q: %w", cfg.Bucket, err)
	}

	return store, nil
}

func (s *s3Store) ensureBucket(ctx context.Context, bucket string) error {
	_, err := s.client.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		// Ignore "bucket already exists" errors from both MinIO and AWS.
		var bae *s3types.BucketAlreadyExists
		var baob *s3types.BucketAlreadyOwnedByYou
		if errors.As(err, &bae) || errors.As(err, &baob) {
			return nil
		}
		return err
	}
	return nil
}

func (s *s3Store) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	// Read into a bytes.Reader so the body is seekable. The AWS SDK v2 requires
	// a seekable stream when uploading over HTTP without TLS (MinIO local/staging)
	// because it can't use trailing checksums on a non-seekable stream.
	data, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("objectstore: read body: %w", err)
	}
	sz := int64(len(data))
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:            aws.String(s.bucket),
		Key:               aws.String(key),
		Body:              bytes.NewReader(data),
		ContentLength:     aws.Int64(sz),
		ContentType:       aws.String(contentType),
		ChecksumAlgorithm: s3types.ChecksumAlgorithm(""),
	})
	return err
}

func (s *s3Store) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	return out.Body, nil
}

func (s *s3Store) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (s *s3Store) SignedURL(ctx context.Context, key string, expires time.Duration) (string, error) {
	req, err := s.psign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(expires))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}
